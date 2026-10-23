// @vitest-environment edge-runtime
/// <reference types="vite/client" />
/**
 * Measures which places a saved travel or food video yields, end to end, on
 * recorded TikToks and reels with the real model. Skipped unless PLACE_EVAL=1
 * and GOOGLE_GENERATIVE_AI_API_KEY are set; a run costs a few cents of Gemini.
 *
 *   PLACE_EVAL=1 PLACE_EVAL_RUNS=3 GOOGLE_GENERATIVE_AI_API_KEY=... \
 *     pnpm exec vitest run convex/placeExtraction.eval.test.ts
 *
 * Each video is saved through `processItem` (the reader sees the recorded
 * oEmbed or Instagram pages, Treg the recorded transcript), then `makeTrip`
 * runs over a space holding only that save. A labelled place counts as found
 * when a name the save stores (`open_maps`, `places`) or the trip lists contains one of
 * its spellings. The report prints as one `PLACE_EVAL` JSON line;
 * PLACE_EVAL_ONLY=<video id> measures one video.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, internal } from "@convex/_generated/api";
import { newConvexTest } from "./test.setup";
import fixture from "./testdata/placeEval/videos.json";

type Video = {
  id: string;
  url: string;
  city: string;
  oembed?: Record<string, unknown>;
  instagram?: { page: string; embed: string };
  transcript: string | null;
  places: string[][];
};

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const ENABLED =
  process.env.PLACE_EVAL === "1" &&
  (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "") !== "";
const RUNS = Number(process.env.PLACE_EVAL_RUNS ?? "1");
const videos = (fixture.videos as Video[]).filter(
  (video) =>
    !process.env.PLACE_EVAL_ONLY || video.id === process.env.PLACE_EVAL_ONLY,
);

function ok(url: string, contentType: string, body: string) {
  return {
    ok: true,
    finalUrl: url,
    status: 200,
    contentType,
    bytes: new TextEncoder().encode(body),
  };
}

function serve(video: Video) {
  safeFetch.mockImplementation(async (url: string) => {
    if (video.oembed && url.startsWith("https://www.tiktok.com/oembed?")) {
      return ok(url, "application/json", JSON.stringify(video.oembed));
    }
    if (video.instagram && url.includes("instagram.com/")) {
      return ok(
        url,
        "text/html",
        url.includes("/embed/") ? video.instagram.embed : video.instagram.page,
      );
    }
    return { ok: false, code: "http_error", status: 599 };
  });
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("https://treg.to/")) {
        return await realFetch(input, init);
      }
      if (video.transcript === null) {
        return new Response("{}", { status: 404 });
      }
      const body = url.includes("instagram")
        ? { success: true, transcripts: [{ text: video.transcript }] }
        : { success: true, transcript: video.transcript };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
}

function squash(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function found(spellings: string[], names: string[]): boolean {
  const said = names.map(squash);
  return spellings.some((spelling) =>
    said.some((name) => name.includes(squash(spelling))),
  );
}

async function seed(video: Video) {
  const base = newConvexTest();
  const ids = await base.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 3_600_000,
      updatedAt: Date.now(),
    });
    const spaceId = await ctx.db.insert("spaces", {
      userId,
      name: `${video.city} trip`,
      dynamic: false,
    });
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "link",
      url: video.url,
      status: "processing",
      processingRunId: "run-1",
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
    });
    return { userId, spaceId, itemId };
  });
  return { base, ...ids };
}

async function tripNames(
  t: ReturnType<ReturnType<typeof newConvexTest>["withIdentity"]>,
  base: ReturnType<typeof newConvexTest>,
  spaceId: Awaited<ReturnType<typeof seed>>["spaceId"],
): Promise<string[]> {
  const { tripId } = await t.action(api.trips.makeTrip, {
    spaceId,
    days: 15,
    pace: "packed",
  });
  const trip = tripId ? await base.run((ctx) => ctx.db.get(tripId)) : null;
  return trip
    ? [
        ...trip.days.flatMap((day) => day.stops.map((stop) => stop.name)),
        ...trip.wishlist.map((stop) => stop.name),
      ]
    : [];
}

async function measure(video: Video) {
  serve(video);
  const { base, userId, spaceId, itemId } = await seed(video);
  await base.action(internal.ai.processItem, { itemId, runId: "run-1" });
  const item = await base.run(async (ctx) => {
    await ctx.db.insert("spaceItems", {
      userId,
      spaceId,
      itemId,
      status: "saved",
    });
    return await ctx.db.get(itemId);
  });
  const stored = [
    ...(item?.intents ?? [])
      .filter((intent) => intent.kind === "open_maps")
      .map((intent) => intent.value),
    ...(item?.places ?? []),
  ];
  const trip = await tripNames(
    base.withIdentity({ subject: `${userId}|session-1` }),
    base,
    spaceId,
  );
  return {
    id: video.id,
    status: item?.status,
    cities: item?.cities ?? [],
    labelled: video.places.length,
    storedFound: video.places.filter((p) => found(p, stored)).length,
    tripFound: video.places.filter((p) => found(p, trip)).length,
    missedByTrip: video.places.filter((p) => !found(p, trip)).map((p) => p[0]),
    unlabelled: trip.filter(
      (name) => !video.places.some((p) => found(p, [name])),
    ),
    stored,
  };
}

const report: Awaited<ReturnType<typeof measure>>[][] = [];

afterAll(() => {
  if (report.length === 0) return;
  const total = (run: number, key: "labelled" | "storedFound" | "tripFound") =>
    report[run].reduce((sum, row) => sum + row[key], 0);
  const runs = report.map((_, run) => ({
    labelled: total(run, "labelled"),
    stored: total(run, "storedFound"),
    trip: total(run, "tripFound"),
  }));
  // The edge-runtime console does not reach vitest's output.
  process.stdout.write(
    `PLACE_EVAL ${JSON.stringify({ runs, rows: report })}\n`,
  );
});

describe.skipIf(!ENABLED)("place extraction on recorded videos", () => {
  it(
    "measures every recorded video",
    async () => {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
      vi.stubEnv("TREG_API_KEY", "eval");
      vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "true");
      for (let run = 0; run < RUNS; run++) {
        const rows = [];
        for (const video of videos) {
          rows.push(await measure(video));
          vi.unstubAllGlobals();
        }
        report.push(rows);
      }
      expect(report).toHaveLength(RUNS);
    },
    30 * 60_000,
  );
});
