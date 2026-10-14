import { z } from "zod";
import { env } from "../_generated/server";

/**
 * What a short cooking video says out loud, for the recipe a caption left out.
 * Treg (treg.to) proxies ScrapeCreators' transcript endpoints: TikTok's own
 * caption track, and speech-to-text for an Instagram reel. About $0.002 a
 * transcript, nothing when there is none. Every call goes to one fixed origin
 * with the deployment's token, so it does not go through safeFetch, which
 * refuses secret headers.
 */
const TREG_ORIGIN = "https://treg.to";

/** Probed 2026-10-14: TikTok answered in about 2 s, a 47 s reel in about 7 s.
 * Treg's own upstream deadline is 180 s; a save does not wait that long. */
const TRANSCRIPT_TIMEOUT_MS = 15_000;

/** A reel's transcript is a few KB; anything this size is not one. */
const MAX_RESPONSE_CHARS = 512 * 1024;

/** What the recipe prompt receives. A spoken recipe fits with room to spare. */
export const MAX_TRANSCRIPT_CHARS = 6000;

export type TranscriptSite = "TikTok" | "Instagram";

export type TranscriptResult =
  | { status: "ok"; text: string }
  /** The video has no caption track or speech, or the post is gone. */
  | { status: "none" }
  | { status: "failed"; errorCategory: string };

/** The server switch and the token: transcripts are fetched only while
 * `VIDEO_TRANSCRIPTS_ENABLED` is "true" and `TREG_API_KEY` is set. Turning
 * the switch off stops them at the next save, with no deploy. */
export function transcriptToken(): string | undefined {
  return env.VIDEO_TRANSCRIPTS_ENABLED === "true" && env.TREG_API_KEY
    ? env.TREG_API_KEY
    : undefined;
}

function endpoint(site: TranscriptSite, url: string): string {
  const params =
    site === "TikTok"
      ? new URLSearchParams({ url, language: "en" })
      : // A cached reel transcript costs nothing.
        new URLSearchParams({ url, cache_max_age: "7d" });
  const path =
    site === "TikTok"
      ? "scrapecreators.x.v1-tiktok-video-transcript"
      : "scrapecreators.x.v2-instagram-media-transcript";
  return `${TREG_ORIGIN}/call/${path}?${params.toString()}`;
}

const tikTokSchema = z.object({
  transcript: z.string().nullish(),
});

const instagramSchema = z.object({
  transcripts: z.array(z.object({ text: z.string().nullish() })).nullish(),
});

/** TikTok's caption track is WebVTT. Its cue timings, the header and the
 * repeats a rolling caption leaves behind are noise to the model. */
export function vttToText(vtt: string): string {
  const raw = vtt.split(/\r?\n/).map((line) => line.trim());
  const lines: string[] = [];
  raw.forEach((line, index) => {
    // A digit-only line is a cue id only when its cue's timing follows; on
    // its own it is something said, such as "350".
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

/** Treg relays the provider's body; some providers arrive under `output`. */
function providerPayload(body: unknown): unknown {
  return body !== null && typeof body === "object" && "output" in body
    ? body.output
    : body;
}

const providerErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().nullish(),
});

/** Treg answers 200 for a provider's error, which only its body names. A
 * post with no video or speech is "not_found"; anything else is a failure. */
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

/**
 * The spoken transcript of a TikTok or Instagram video, best effort. Never
 * throws: a missing transcript is "none", anything else is "failed" with a
 * category safe to log. The URL and the transcript are never logged.
 */
export async function fetchVideoTranscript(
  site: TranscriptSite,
  url: string,
  token: string,
): Promise<TranscriptResult> {
  let response: Response;
  try {
    response = await fetch(endpoint(site, url), {
      headers: { "X-Treg-Token": token, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TRANSCRIPT_TIMEOUT_MS),
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
  // A missing post answers 404; the body says nothing more worth reading.
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
  if (error !== undefined) {
    return { status: "failed", errorCategory: error };
  }
  const text = transcriptText(site, payload).slice(0, MAX_TRANSCRIPT_CHARS);
  return text === "" ? { status: "none" } : { status: "ok", text };
}
