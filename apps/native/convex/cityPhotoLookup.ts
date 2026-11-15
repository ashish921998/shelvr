"use node";

import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  commonsThumbUrl,
  isPlacePage,
  parseImageClaim,
  parseSummary,
  plainThumbnail,
  summaryTitle,
  widenedThumbnail,
} from "./model/cityPhoto";
import { logEvent } from "./model/log";
import { SHELVR_USER_AGENT } from "./model/pageReadCore";
import { parseJson, safeFetch } from "./model/safeFetch";

type Lookup =
  | { status: "found"; url: string; file?: string }
  | { status: "missing" | "failed" };

const IMAGE_TIMEOUT_MS = 30000;

const HEADERS = {
  "User-Agent": SHELVR_USER_AGENT,
  Accept: "application/json",
};

async function fetchJson(
  url: string,
  trace: Trace,
): Promise<{ ok: true; body: unknown } | { ok: false; status?: number }> {
  const result = await safeFetch(url, {
    timeoutMs: 10000,
    maxBytes: 256 * 1024,
    allowContentType: (type) => type.startsWith("application/json"),
    headers: HEADERS,
  });
  if (!result.ok) {
    trace.lastFailure = `json_${result.status ?? result.code}`;
    return { ok: false, status: result.status };
  }
  try {
    return { ok: true, body: parseJson(result.bytes) };
  } catch {
    return { ok: false };
  }
}

type ImageCheck = "image" | "gone" | "unreachable";

type Trace = { lastFailure: string };

const GONE_STATUSES = new Set([400, 403, 404, 410]);

async function checkImage(url: string, trace: Trace): Promise<ImageCheck> {
  const result = await safeFetch(url, {
    timeoutMs: IMAGE_TIMEOUT_MS,
    maxBytes: 4096,
    onOverflow: "truncate",
    allowContentType: (type) => type.startsWith("image/"),
    headers: { "User-Agent": SHELVR_USER_AGENT },
  });
  if (result.ok) return "image";
  trace.lastFailure = `image_${result.status ?? result.code}`;
  if (result.code === "unsupported_content_type") return "gone";
  return result.status !== undefined && GONE_STATUSES.has(result.status)
    ? "gone"
    : "unreachable";
}

async function commonsFile(
  item: string | undefined,
  trace: Trace,
): Promise<{ file?: string; unreachable: boolean }> {
  if (item === undefined) return { unreachable: false };
  const claims = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P18&entity=${encodeURIComponent(item)}`,
    trace,
  );
  if (!claims.ok) return { unreachable: true };
  return { file: parseImageClaim(claims.body), unreachable: false };
}

function md5(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

async function findPhoto(city: string, trace: Trace): Promise<Lookup> {
  const page = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${summaryTitle(city)}`,
    trace,
  );
  if (!page.ok) {
    return { status: page.status === 404 ? "missing" : "failed" };
  }
  const summary = parseSummary(page.body);
  if (summary === null || !isPlacePage(summary)) return { status: "missing" };
  const { file, unreachable: claimsUnreachable } = await commonsFile(
    summary.wikibaseItem,
    trace,
  );
  const candidates: { url: string; file?: string }[] = [];
  if (file !== undefined) {
    const name = file.replace(/ /g, "_");
    candidates.push({ url: commonsThumbUrl(name, md5(name)), file: name });
  }
  const lead = widenedThumbnail(summary.thumbnail);
  if (lead !== undefined) candidates.push({ url: lead });
  const plain = plainThumbnail(summary.thumbnail);
  if (plain !== undefined) candidates.push({ url: plain });
  let unreachable = claimsUnreachable;
  for (const candidate of candidates) {
    const check = await checkImage(candidate.url, trace);
    if (check === "image") return { status: "found", ...candidate };
    if (check === "unreachable") unreachable = true;
  }
  return { status: unreachable ? "failed" : "missing" };
}

function photoSource(outcome: Lookup): string {
  if (outcome.status !== "found") return "none";
  return outcome.file === undefined ? "wikipedia" : "wikidata";
}

export const lookUp = internalAction({
  args: { key: v.string(), city: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let outcome: Lookup;
    const trace: Trace = { lastFailure: "none" };
    try {
      outcome = await findPhoto(args.city, trace);
    } catch {
      outcome = { status: "failed" };
    }
    logEvent(
      outcome.status === "failed" ? "warn" : "info",
      "city_photo_lookup",
      {
        outcome: outcome.status,
        source: photoSource(outcome),
        last_failure: trace.lastFailure,
      },
    );
    await ctx.runMutation(internal.cityPhotos.store, {
      key: args.key,
      ...outcome,
    });
    return null;
  },
});
