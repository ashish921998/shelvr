// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMember, addUser, newConvexTest } from "./test.setup";

const head =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVIEW_STAFF_EMAILS", "boss@shelvr.app");
  vi.stubEnv("R2_ACCOUNT_ID", "acct");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
  vi.stubEnv("R2_BUCKET", "review");
  head.mockReset();
  vi.stubGlobal("fetch", head);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = newConvexTest();
  const boss = await addUser(t, "boss@shelvr.app");
  const campaignId = await boss.as.mutation(api.campaigns.create, {
    name: "Launch",
  });
  const alice = await addMember(t, campaignId, "alice@example.com", "creator");
  const bob = await addMember(t, campaignId, "bob@example.com", "creator");
  const outsider = await addUser(t, "eve@example.com");
  const mediaId = await alice.as.mutation(api.media.start, {
    campaignId,
    contentType: "video/mp4",
  });
  return { t, boss, alice, bob, outsider, campaignId, mediaId };
}

function sized(size: number) {
  return new Response(null, {
    status: 200,
    headers: { "content-length": String(size) },
  });
}

describe("start", () => {
  test("refuses people outside the campaign and files that are not video", async () => {
    const { alice, outsider, campaignId } = await setup();
    await expect(
      outsider.as.mutation(api.media.start, {
        campaignId,
        contentType: "video/mp4",
      }),
    ).rejects.toThrow("not in this campaign");
    await expect(
      alice.as.mutation(api.media.start, {
        campaignId,
        contentType: "video/x-msvideo",
      }),
    ).rejects.toThrow("Upload a video file");
  });
});

describe("createUpload", () => {
  test("refuses an uploader who was removed from the campaign", async () => {
    const { t, alice, campaignId, mediaId } = await setup();
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("members")
        .withIndex("by_campaignId_and_userId", (q) =>
          q.eq("campaignId", campaignId).eq("userId", alice.userId),
        )
        .unique();
      if (row) await ctx.db.delete("members", row._id);
    });
    await expect(
      alice.as.action(api.media.createUpload, {
        mediaId,
        contentType: "video/mp4",
      }),
    ).rejects.toThrow("not yours");
  });

  test("gives the uploader a signed PUT for the media key", async () => {
    const { t, alice, mediaId } = await setup();
    const target = await alice.as.action(api.media.createUpload, {
      mediaId,
      contentType: "video/MP4; codecs=avc1",
    });
    expect(target.contentType).toBe("video/mp4");
    const url = new URL(target.url);
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/review/media/${mediaId}`);
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media).toMatchObject({
      status: "waiting",
      storageKey: `media/${mediaId}`,
      contentType: "video/mp4",
    });
  });

  test("refuses anyone but the uploader", async () => {
    const { bob, boss, mediaId } = await setup();
    for (const who of [bob, boss]) {
      await expect(
        who.as.action(api.media.createUpload, {
          mediaId,
          contentType: "video/mp4",
        }),
      ).rejects.toThrow("not yours");
    }
  });

  test("refuses a file that is not a video", async () => {
    const { alice, mediaId } = await setup();
    await expect(
      alice.as.action(api.media.createUpload, {
        mediaId,
        contentType: "text/html",
      }),
    ).rejects.toThrow("Upload a video file");
  });

  test("says storage is not set up when R2 settings are missing", async () => {
    const { alice, mediaId } = await setup();
    vi.stubEnv("R2_BUCKET", "");
    await expect(
      alice.as.action(api.media.createUpload, {
        mediaId,
        contentType: "video/mp4",
      }),
    ).rejects.toThrow("not set up");
  });
});

describe("completeUpload", () => {
  test("marks the media ready with its size, length and shape", async () => {
    const { t, alice, mediaId } = await setup();
    await alice.as.action(api.media.createUpload, {
      mediaId,
      contentType: "video/quicktime",
    });
    head.mockResolvedValueOnce(sized(5_000_000));
    const status = await alice.as.action(api.media.completeUpload, {
      mediaId,
      duration: 31.5,
      width: 1080,
      height: 1920,
    });
    expect(status).toBe("ready");
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media).toMatchObject({
      status: "ready",
      size: 5_000_000,
      duration: 31.5,
      aspectRatio: "9:16",
    });
  });

  test("marks the media errored when nothing was uploaded", async () => {
    const { t, alice, mediaId } = await setup();
    await alice.as.action(api.media.createUpload, {
      mediaId,
      contentType: "video/mp4",
    });
    head.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const status = await alice.as.action(api.media.completeUpload, {
      mediaId,
      duration: Number.NaN,
    });
    expect(status).toBe("errored");
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media?.status).toBe("errored");
  });

  test("refuses to finish an upload that never started", async () => {
    const { alice, mediaId } = await setup();
    await expect(
      alice.as.action(api.media.completeUpload, { mediaId }),
    ).rejects.toThrow("not yours");
  });
});

describe("playbackTokens", () => {
  async function ready() {
    const ctx = await setup();
    await ctx.alice.as.action(api.media.createUpload, {
      mediaId: ctx.mediaId,
      contentType: "video/mp4",
    });
    head.mockResolvedValueOnce(sized(100));
    await ctx.alice.as.action(api.media.completeUpload, {
      mediaId: ctx.mediaId,
    });
    return ctx;
  }

  test("gives campaign members a signed GET", async () => {
    const { bob, boss, mediaId } = await ready();
    for (const who of [bob, boss]) {
      const [token] = await who.as.action(api.media.playbackTokens, {
        mediaIds: [mediaId],
      });
      expect(token.mediaId).toBe(mediaId);
      const url = new URL(token.url);
      expect(url.pathname).toBe(`/review/media/${mediaId}`);
      expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    }
  });

  test("gives nothing to people outside the campaign", async () => {
    const { t, outsider, mediaId } = await ready();
    expect(
      await outsider.as.action(api.media.playbackTokens, {
        mediaIds: [mediaId],
      }),
    ).toEqual([]);
    expect(
      await t.action(api.media.playbackTokens, { mediaIds: [mediaId] }),
    ).toEqual([]);
  });

  test("skips media that is not ready yet", async () => {
    const { alice, mediaId } = await setup();
    expect(
      await alice.as.action(api.media.playbackTokens, { mediaIds: [mediaId] }),
    ).toEqual([]);
  });
});
