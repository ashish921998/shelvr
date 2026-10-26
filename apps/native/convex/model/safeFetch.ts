"use node";

import { Agent, type Dispatcher } from "undici";
import type BodyReadable from "undici/types/readable";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import ipaddr from "ipaddr.js";
import {
  normalizeExternalUrl,
  isUrlPolicyError,
  type UrlPolicyError,
} from "./externalUrl";

export type SafeFetchError =
  | UrlPolicyError
  | "blocked_destination"
  | "redirect_limit"
  | "timeout"
  | "unsupported_content_type"
  | "response_too_large"
  | "http_error"
  | "fetch_failed";

export class SafeFetchErrorClass extends Error {
  constructor(
    public readonly code: SafeFetchError,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export function isSafeFetchError(e: unknown): e is SafeFetchErrorClass {
  return e instanceof SafeFetchErrorClass;
}

export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      const mapped = v6.toIPv4Address();
      return mapped.range() === "unicast";
    }
  }
  return parsed.range() === "unicast";
}

function assertHostAllowed(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new SafeFetchErrorClass("invalid_url", "invalid host");
  }
  if (hostname === "") {
    throw new SafeFetchErrorClass("blocked_destination", "missing host");
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  try {
    ipaddr.parse(hostname);
  } catch {
    return;
  }
  if (!isPublicAddress(hostname)) {
    throw new SafeFetchErrorClass("blocked_destination", "private ip literal");
  }
}

export type DnsResolver = (
  hostname: string,
) => Promise<readonly LookupAddress[]>;

const DNS_LOOKUP_TIMEOUT_MS = 8000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error("dns lookup timed out"), { code })),
      ms,
    );
  });
  return Promise.race([promise, expiry]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export const defaultResolver: DnsResolver = async (hostname) => {
  const lookup = dnsLookup(hostname, { all: true, verbatim: true });
  return withTimeout(lookup, DNS_LOOKUP_TIMEOUT_MS, "ETIMEDOUT");
};

export function makeValidatingLookup(resolver: DnsResolver) {
  return async (
    hostname: string,
    options: { all?: boolean } | null,
    callback: (
      err: NodeJS.ErrnoException | null,
      addressOrAddresses: string | LookupAddress[] | null,
      family?: number,
    ) => void,
  ): Promise<void> => {
    let addresses: readonly LookupAddress[];
    try {
      addresses = await resolver(hostname);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      callback(err, "", 4);
      return;
    }
    if (addresses.length === 0) {
      callback(
        Object.assign(new Error("no DNS answers"), {
          code: "ENOTFOUND",
        }) as NodeJS.ErrnoException,
        "",
        4,
      );
      return;
    }
    for (const a of addresses) {
      if (!isPublicAddress(a.address)) {
        const err = Object.assign(new Error("blocked private destination"), {
          code: "ECONNREFUSED",
        }) as NodeJS.ErrnoException;
        callback(err, "", 4);
        return;
      }
    }
    if (options !== null && options.all === true) {
      callback(null, [...addresses] as LookupAddress[], undefined);
      return;
    }
    const chosen = addresses[0];
    callback(null, chosen.address, chosen.family);
  };
}

function makeSafeDispatcher(
  resolver: DnsResolver = defaultResolver,
): Dispatcher {
  return new Agent({
    connect: { lookup: makeValidatingLookup(resolver) as never },
  });
}

let sharedDispatcher: Dispatcher | undefined;

function getSharedDispatcher(): Dispatcher {
  if (sharedDispatcher === undefined) {
    sharedDispatcher = makeSafeDispatcher(defaultResolver);
  }
  return sharedDispatcher;
}

type SafeFetchOk = {
  ok: true;
  finalUrl: string;
  status: number;
  contentType: string;
  bytes: Uint8Array;
  truncated?: true;
};

type SafeFetchResult =
  | SafeFetchOk
  | {
      ok: false;
      code: SafeFetchError;
      status?: number;
    };

type SafeFetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  allowContentType?: (contentType: string) => boolean;
  headers?: Record<string, string>;
  maxRedirects?: number;
  dispatcher?: Dispatcher;
  onOverflow?: "error" | "truncate";
};

const DEFAULT_MAX_REDIRECTS = 3;

async function readBounded(
  body: BodyReadable,
  maxBytes: number,
  signal: AbortSignal,
  onOverflow: "error" | "truncate" = "error",
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as unknown as AsyncIterable<Buffer>) {
    if (signal.aborted) {
      throw new SafeFetchErrorClass(
        "timeout",
        "deadline exceeded while reading body",
      );
    }
    total += chunk.length;
    if (total > maxBytes) {
      if (onOverflow === "truncate") {
        const excess = total - maxBytes;
        const kept = chunk.slice(0, chunk.length - excess);
        if (kept.length > 0) chunks.push(kept);
        await safeDump(body);
        if (signal.aborted) {
          throw new SafeFetchErrorClass(
            "timeout",
            "deadline exceeded while draining overflow",
          );
        }
        return {
          bytes: new Uint8Array(Buffer.concat(chunks)),
          truncated: true,
        };
      }
      await safeDump(body);
      throw new SafeFetchErrorClass(
        "response_too_large",
        "body exceeded max bytes",
      );
    }
    chunks.push(chunk);
  }
  return { bytes: new Uint8Array(Buffer.concat(chunks)), truncated: false };
}

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  return safeFetchThrowing(rawUrl, options).then(
    (value) => ({ ok: true, ...value }) as SafeFetchOk,
    (e: unknown) => {
      if (isSafeFetchError(e)) {
        return { ok: false, code: e.code, status: e.status };
      }
      if (isUrlPolicyError(e)) {
        return { ok: false, code: e.code };
      }
      return { ok: false, code: "fetch_failed" };
    },
  );
}

function followRedirect(
  response: Dispatcher.ResponseData,
  currentUrl: string,
  redirectsDone: number,
  maxRedirects: number,
): string {
  if (redirectsDone >= maxRedirects) {
    throw new SafeFetchErrorClass("redirect_limit", "too many redirects");
  }
  const location = response.headers["location"];
  if (typeof location !== "string" || location === "") {
    throw new SafeFetchErrorClass("fetch_failed", "redirect without Location");
  }
  let nextUrl: string;
  try {
    nextUrl = normalizeExternalUrl(new URL(location, currentUrl).toString());
  } catch (e) {
    if (isUrlPolicyError(e)) {
      throw new SafeFetchErrorClass(
        e.code,
        "redirect target rejected by url policy",
      );
    }
    throw new SafeFetchErrorClass("fetch_failed", "invalid redirect target");
  }
  assertHostAllowed(nextUrl);
  return nextUrl;
}

async function rejectOversizeContentLength(
  response: Dispatcher.ResponseData,
  maxBytes: number,
): Promise<void> {
  const declared = response.headers["content-length"];
  if (typeof declared !== "string") {
    return;
  }
  const len = Number(declared);
  if (Number.isFinite(len) && len > maxBytes) {
    await safeDump(response.body);
    throw new SafeFetchErrorClass(
      "response_too_large",
      "content-length over cap",
    );
  }
}

async function safeFetchThrowing(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<Omit<SafeFetchOk, "ok">> {
  const {
    timeoutMs,
    maxBytes,
    allowContentType = () => true,
    headers = {},
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    dispatcher = getSharedDispatcher(),
    onOverflow = "error",
  } = options;

  let currentUrl = normalizeExternalUrl(rawUrl);
  assertHostAllowed(currentUrl);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    let redirects = 0;
    for (;;) {
      if (ac.signal.aborted) {
        throw new SafeFetchErrorClass("timeout", "deadline exceeded");
      }
      const response = await dispatch(
        dispatcher,
        currentUrl,
        headers,
        ac.signal,
      );
      if (response.statusCode >= 300 && response.statusCode < 400) {
        await safeDump(response.body);
        currentUrl = followRedirect(
          response,
          currentUrl,
          redirects,
          maxRedirects,
        );
        redirects++;
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await safeDump(response.body);
        throw new SafeFetchErrorClass(
          "http_error",
          `http status ${response.statusCode}`,
          response.statusCode,
        );
      }
      const contentType = String(response.headers["content-type"] ?? "");
      if (!allowContentType(contentType.toLowerCase())) {
        await safeDump(response.body);
        throw new SafeFetchErrorClass(
          "unsupported_content_type",
          "content type not allowed",
        );
      }
      if (onOverflow === "error") {
        await rejectOversizeContentLength(response, maxBytes);
      }
      const { bytes, truncated } = await readBounded(
        response.body,
        maxBytes,
        ac.signal,
        onOverflow,
      );
      return {
        finalUrl: currentUrl,
        status: response.statusCode,
        contentType,
        bytes,
        ...(truncated ? { truncated: true as const } : {}),
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function dispatch(
  dispatcher: Dispatcher,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Dispatcher.ResponseData> {
  const parsed = new URL(url);
  const abortRace = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new SafeFetchErrorClass("timeout", "deadline exceeded"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new SafeFetchErrorClass("timeout", "deadline exceeded")),
      { once: true },
    );
  });
  try {
    return await Promise.race([
      dispatcher.request({
        method: "GET",
        origin: parsed.origin,
        path: parsed.pathname + parsed.search,
        headers,
        signal,
      }),
      abortRace,
    ]);
  } catch (e) {
    if (e instanceof SafeFetchErrorClass) {
      throw e;
    }
    const err = e as NodeJS.ErrnoException;
    if (
      err !== null &&
      typeof err === "object" &&
      err.code === "ECONNREFUSED"
    ) {
      throw new SafeFetchErrorClass("blocked_destination", "request failed");
    }
    if (signal.aborted) {
      throw new SafeFetchErrorClass("timeout", "deadline exceeded");
    }
    throw new SafeFetchErrorClass("fetch_failed", "request failed");
  }
}

async function safeDump(body: BodyReadable | null | undefined): Promise<void> {
  if (body === null || body === undefined) {
    return;
  }
  try {
    await body.dump();
  } catch {}
}

const WINDOWS_1252_LABELS = new Set([
  "ansi_x3.4-1968",
  "ascii",
  "cp1252",
  "cp819",
  "csisolatin1",
  "ibm819",
  "iso-8859-1",
  "iso-ir-100",
  "iso8859-1",
  "iso88591",
  "iso_8859-1",
  "iso_8859-1:1987",
  "l1",
  "latin1",
  "us-ascii",
  "windows-1252",
  "x-cp1252",
]);

const WINDOWS_1252_C1: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    out += String.fromCharCode(
      byte >= 0x80 && byte <= 0x9f ? WINDOWS_1252_C1[byte - 0x80] : byte,
    );
  }
  return out;
}

export function decodeWithContentType(
  bytes: Uint8Array,
  contentType: string,
): string {
  const match = contentType.match(/charset\s*=\s*["']?([\w.:-]+)/i);
  const charset = match?.[1]?.toLowerCase();
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    if (WINDOWS_1252_LABELS.has(charset)) {
      return decodeWindows1252(bytes);
    }
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {}
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8").decode(bytes));
}
