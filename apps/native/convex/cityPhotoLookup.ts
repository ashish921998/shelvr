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
  summaryTitle,
  widenedThumbnail,
} from "./model/cityPhoto";
import { logEvent } from "./model/log";
import { SHELVR_USER_AGENT } from "./model/pageReadCore";
import { parseJson, safeFetch } from "./model/safeFetch";

type Lookup =
  | { status: "found"; url: string; file?: string }
  | { status: "missing" | "failed" };

const HEADERS = {
  "User-Agent": SHELVR_USER_AGENT,
  Accept: "application/json",
};

async function fetchJson(
  url: string,
): Promise<{ ok: true; body: unknown } | { ok: false; status?: number }> {
  const result = await safeFetch(url, {
    timeoutMs: 10000,
    maxBytes: 256 * 1024,
    allowContentType: (type) => type.startsWith("application/json"),
    headers: HEADERS,
  });
  if (!result.ok) return { ok: false, status: result.status };
  try {
    return { ok: true, body: parseJson(result.bytes) };
  } catch {
    return { ok: false };
  }
}

async function isImage(url: string): Promise<boolean> {
  const result = await safeFetch(url, {
    timeoutMs: 10000,
    maxBytes: 4096,
    onOverflow: "truncate",
    allowContentType: (type) => type.startsWith("image/"),
    headers: { "User-Agent": SHELVR_USER_AGENT },
  });
  return result.ok;
}

async function commonsFile(item: string): Promise<string | undefined> {
  const claims = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P18&entity=${encodeURIComponent(item)}`,
  );
  return claims.ok ? parseImageClaim(claims.body) : undefined;
}

function md5(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

async function findPhoto(city: string): Promise<Lookup> {
  const page = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${summaryTitle(city)}`,
  );
  if (!page.ok) {
    return { status: page.status === 404 ? "missing" : "failed" };
  }
  const summary = parseSummary(page.body);
  if (summary === null || !isPlacePage(summary)) return { status: "missing" };
  const file =
    summary.wikibaseItem === undefined
      ? undefined
      : await commonsFile(summary.wikibaseItem);
  const candidates: { url: string; file?: string }[] = [];
  if (file !== undefined) {
    const name = file.replace(/ /g, "_");
    candidates.push({ url: commonsThumbUrl(name, md5(name)), file: name });
  }
  const lead = widenedThumbnail(summary.thumbnail);
  if (lead !== undefined) candidates.push({ url: lead });
  if (
    summary.thumbnail !== undefined &&
    widenedThumbnail(summary.thumbnail) !== undefined
  ) {
    candidates.push({ url: summary.thumbnail });
  }
  for (const candidate of candidates) {
    if (await isImage(candidate.url)) {
      return { status: "found", ...candidate };
    }
  }
  return { status: "missing" };
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
    try {
      outcome = await findPhoto(args.city);
    } catch {
      outcome = { status: "failed" };
    }
    logEvent(
      outcome.status === "failed" ? "warn" : "info",
      "city_photo_lookup",
      { outcome: outcome.status, source: photoSource(outcome) },
    );
    await ctx.runMutation(internal.cityPhotos.store, {
      key: args.key,
      ...outcome,
    });
    return null;
  },
});
