import { z } from "zod";
import { env } from "../_generated/server";

const TREG_ORIGIN = "https://treg.to";

const TREG_TIMEOUT_MS = 15_000;

const MAX_RESPONSE_CHARS = 512 * 1024;

export const MAX_TRANSCRIPT_CHARS = 6000;

export type TranscriptSite = "TikTok" | "Instagram";

export type TranscriptResult =
  | { status: "ok"; text: string }
  | { status: "none" }
  | { status: "failed"; errorCategory: string };

type TregReply =
  | { status: "ok"; payload: unknown }
  | { status: "none" }
  | { status: "failed"; errorCategory: string };

export function transcriptToken(): string | undefined {
  return env.VIDEO_TRANSCRIPTS_ENABLED === "true" && env.TREG_API_KEY
    ? env.TREG_API_KEY
    : undefined;
}

function transcriptEndpoint(site: TranscriptSite, url: string) {
  return site === "TikTok"
    ? {
        path: "scrapecreators.x.v1-tiktok-video-transcript",
        params: new URLSearchParams({ url, language: "en" }),
      }
    : {
        path: "scrapecreators.x.v2-instagram-media-transcript",
        params: new URLSearchParams({ url, cache_max_age: "7d" }),
      };
}

const tikTokSchema = z.object({
  transcript: z.string().nullish(),
});

const instagramSchema = z.object({
  transcripts: z.array(z.object({ text: z.string().nullish() })).nullish(),
});

export function vttToText(vtt: string): string {
  const raw = vtt.split(/\r?\n/).map((line) => line.trim());
  const lines: string[] = [];
  raw.forEach((line, index) => {
    const cueId = /^\d+$/.test(line) && raw[index + 1]?.includes("-->");
    if (
      line === "" ||
      line === "WEBVTT" ||
      cueId ||
      line.includes("-->") ||
      lines[lines.length - 1] === line
    ) {
      return;
    }
    lines.push(line);
  });
  return lines.join(" ");
}

function providerPayload(body: unknown): unknown {
  return body !== null && typeof body === "object" && "output" in body
    ? body.output
    : body;
}

const providerErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().nullish(),
});

function providerError(payload: unknown): string | undefined {
  const parsed = providerErrorSchema.safeParse(payload);
  return parsed.success && parsed.data.error !== "not_found"
    ? "provider_error"
    : undefined;
}

function transcriptText(site: TranscriptSite, payload: unknown): string {
  if (site === "TikTok") {
    const parsed = tikTokSchema.safeParse(payload);
    return parsed.success ? vttToText(parsed.data.transcript ?? "") : "";
  }
  const parsed = instagramSchema.safeParse(payload);
  return parsed.success
    ? (parsed.data.transcripts ?? [])
        .map((part) => part.text?.trim() ?? "")
        .filter((text) => text !== "")
        .join(" ")
    : "";
}

export async function callTreg(
  path: string,
  params: URLSearchParams,
  token: string,
): Promise<TregReply> {
  let response: Response;
  try {
    response = await fetch(`${TREG_ORIGIN}/call/${path}?${params.toString()}`, {
      headers: { "X-Treg-Token": token, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TREG_TIMEOUT_MS),
    });
  } catch (error) {
    const name =
      error !== null && typeof error === "object" && "name" in error
        ? String(error.name)
        : "unknown";
    return {
      status: "failed",
      errorCategory: name === "TimeoutError" ? "timeout" : "fetch_failed",
    };
  }
  if (response.status === 404) {
    return { status: "none" };
  }
  if (!response.ok) {
    return { status: "failed", errorCategory: `http_${response.status}` };
  }
  let body: unknown;
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS) {
      return { status: "failed", errorCategory: "too_large" };
    }
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_CHARS) {
      return { status: "failed", errorCategory: "too_large" };
    }
    body = JSON.parse(raw);
  } catch {
    return { status: "failed", errorCategory: "bad_response" };
  }
  const payload = providerPayload(body);
  const error = providerError(payload);
  return error === undefined
    ? { status: "ok", payload }
    : { status: "failed", errorCategory: error };
}

export async function fetchVideoTranscript(
  site: TranscriptSite,
  url: string,
  token: string,
): Promise<TranscriptResult> {
  const { path, params } = transcriptEndpoint(site, url);
  const reply = await callTreg(path, params, token);
  if (reply.status !== "ok") {
    return reply;
  }
  const text = transcriptText(site, reply.payload).slice(
    0,
    MAX_TRANSCRIPT_CHARS,
  );
  return text === "" ? { status: "none" } : { status: "ok", text };
}
