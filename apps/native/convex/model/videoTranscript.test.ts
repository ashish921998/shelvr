import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchVideoTranscript,
  MAX_TRANSCRIPT_CHARS,
  transcriptToken,
  vttToText,
} from "./videoTranscript";

const TIKTOK = "https://www.tiktok.com/@cook/video/7350000000000000000";
const REEL = "https://www.instagram.com/reel/DKAlHYRpiJh/";

const fetchMock = vi.fn();

function answer(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("vttToText", () => {
  it("drops the header, cue numbers, timings and rolling repeats", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:16.940 --> 00:00:18.560",
      "Drizzle some olive oil,",
      "",
      "00:00:18.560 --> 00:00:19.100",
      "Drizzle some olive oil,",
      "",
      "00:00:19.100 --> 00:00:21.000",
      "then a third of a cup of heavy cream.",
    ].join("\n");
    expect(vttToText(vtt)).toBe(
      "Drizzle some olive oil, then a third of a cup of heavy cream.",
    );
  });
  it("keeps a number said on its own", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:02.000",
      "Bake at",
      "",
      "2",
      "00:00:02.000 --> 00:00:03.000",
      "350",
    ].join("\n");
    expect(vttToText(vtt)).toBe("Bake at 350");
  });
});

describe("transcriptToken", () => {
  it("is set only while the switch is on and the key is present", () => {
    vi.stubEnv("TREG_API_KEY", "unit-test-only");
    vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "true");
    expect(transcriptToken()).toBe("unit-test-only");
    vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "false");
    expect(transcriptToken()).toBeUndefined();
    vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "true");
    vi.stubEnv("TREG_API_KEY", "");
    expect(transcriptToken()).toBeUndefined();
  });
});

describe("fetchVideoTranscript", () => {
  it("reads a TikTok's caption track through Treg with the token", async () => {
    answer({
      success: true,
      credits_charged: 1,
      transcript:
        "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nTwo tablespoons of butter.",
    });
    await expect(
      fetchVideoTranscript("TikTok", TIKTOK, "unit-test-only"),
    ).resolves.toEqual({ status: "ok", text: "Two tablespoons of butter." });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://treg.to/call/scrapecreators.x.v1-tiktok-video-transcript",
    );
    expect(parsed.searchParams.get("url")).toBe(TIKTOK);
    expect(init.headers).toMatchObject({ "X-Treg-Token": "unit-test-only" });
    expect(init.redirect).toBe("error");
  });

  it("joins an Instagram reel's transcripts and asks for the cached one", async () => {
    answer({
      success: true,
      transcripts: [
        { id: "1", shortcode: "DKAlHYRpiJh", text: "Pasta al limone." },
        { id: "2", shortcode: "DKAlHYRpiJh", text: "8 oz of mascarpone." },
      ],
    });
    await expect(
      fetchVideoTranscript("Instagram", REEL, "unit-test-only"),
    ).resolves.toEqual({
      status: "ok",
      text: "Pasta al limone. 8 oz of mascarpone.",
    });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe(
      "/call/scrapecreators.x.v2-instagram-media-transcript",
    );
    expect(url.searchParams.get("cache_max_age")).toBe("7d");
  });

  it("reads a body Treg wraps in output", async () => {
    answer({ output: { transcript: "Salt the water." }, costUsd: 0.002 });
    await expect(
      fetchVideoTranscript("TikTok", TIKTOK, "unit-test-only"),
    ).resolves.toEqual({ status: "ok", text: "Salt the water." });
  });

  it("caps what the prompt receives", async () => {
    answer({ transcript: "a".repeat(MAX_TRANSCRIPT_CHARS + 100) });
    const result = await fetchVideoTranscript("TikTok", TIKTOK, "t");
    expect(result.status === "ok" && result.text.length).toBe(
      MAX_TRANSCRIPT_CHARS,
    );
  });

  it.each([
    [
      "a TikTok with no caption track",
      "TikTok",
      { success: true, transcript: null },
    ],
    [
      "a post with no video",
      "Instagram",
      { success: false, error: "not_found", errorStatus: 404 },
    ],
    [
      "an empty transcript list",
      "Instagram",
      { success: true, transcripts: [] },
    ],
  ] as const)("reports none for %s", async (_name, site, body) => {
    answer(body);
    await expect(fetchVideoTranscript(site, REEL, "t")).resolves.toEqual({
      status: "none",
    });
  });

  it("reports none for a 404", async () => {
    answer({}, 404);
    await expect(fetchVideoTranscript("TikTok", TIKTOK, "t")).resolves.toEqual({
      status: "none",
    });
  });

  it.each([
    [
      "a provider error",
      { success: false, error: "rate_limited" },
      200,
      "provider_error",
    ],
    ["a server error", {}, 502, "http_502"],
    ["a body that is not JSON", "<html>", 200, "bad_response"],
  ] as const)("fails on %s", async (_name, body, status, category) => {
    answer(body, status);
    await expect(fetchVideoTranscript("TikTok", TIKTOK, "t")).resolves.toEqual({
      status: "failed",
      errorCategory: category,
    });
  });

  it("refuses a body that declares itself too large before reading it", async () => {
    fetchMock.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "Content-Length": String(10 * 1024 * 1024) },
      }),
    );
    await expect(fetchVideoTranscript("TikTok", TIKTOK, "t")).resolves.toEqual({
      status: "failed",
      errorCategory: "too_large",
    });
  });

  it("fails on a timeout without throwing", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("slow"), { name: "TimeoutError" }),
    );
    await expect(fetchVideoTranscript("TikTok", TIKTOK, "t")).resolves.toEqual({
      status: "failed",
      errorCategory: "timeout",
    });
  });
});
