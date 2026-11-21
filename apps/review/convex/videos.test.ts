// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMember, addUser, newConvexTest, readyMedia } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVIEW_STAFF_EMAILS", "boss@shelvr.app");
});

afterEach(() => {
  vi.unstubAllEnvs();
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
  const videoId = await alice.as.mutation(api.videos.create, {
    campaignId,
    title: "Hook take",
    mediaId: await readyMedia(t, campaignId, alice.userId),
  });
  const video = await alice.as.query(api.videos.get, { videoId });
  const versionId = video!.versions[0]._id;
  return { t, boss, alice, bob, outsider, campaignId, videoId, versionId };
}

describe("videos", () => {
  test("everyone in the campaign sees every video", async () => {
    const { alice, bob, campaignId, videoId } = await setup();
    const bobsView = await bob.as.query(api.videos.list, { campaignId });
    expect(bobsView).toMatchObject([
      {
        _id: videoId,
        title: "Hook take",
        creatorName: "alice",
        isMine: false,
        status: "needs_review",
        media: { status: "ready" },
      },
    ]);
    const alicesView = await alice.as.query(api.videos.get, { videoId });
    expect(alicesView).toMatchObject({ canUpload: true, canReview: false });
  });

  test("people outside the campaign see nothing and cannot upload", async () => {
    const { t, outsider, campaignId, videoId } = await setup();
    expect(await outsider.as.query(api.videos.list, { campaignId })).toEqual(
      [],
    );
    expect(await outsider.as.query(api.videos.get, { videoId })).toBeNull();
    await expect(
      outsider.as.mutation(api.videos.create, {
        campaignId,
        title: "x",
        mediaId: await readyMedia(t, campaignId, outsider.userId),
      }),
    ).rejects.toThrow("not in this campaign");
  });

  test("only admins change the status", async () => {
    const { boss, alice, videoId, versionId } = await setup();
    await expect(
      alice.as.mutation(api.videos.setStatus, {
        videoId,
        versionId,
        status: "approved",
      }),
    ).rejects.toThrow("Only admins");
    await boss.as.mutation(api.videos.setStatus, {
      videoId,
      versionId,
      status: "changes_requested",
    });
    expect((await alice.as.query(api.videos.get, { videoId }))?.status).toBe(
      "changes_requested",
    );
  });

  test("a new version goes back to needs review", async () => {
    const { t, boss, alice, campaignId, videoId, versionId } = await setup();
    await boss.as.mutation(api.videos.setStatus, {
      videoId,
      versionId,
      status: "changes_requested",
    });
    await alice.as.mutation(api.videos.addVersion, {
      videoId,
      mediaId: await readyMedia(t, campaignId, alice.userId),
      note: "Fixed the lighting",
    });
    const video = await alice.as.query(api.videos.get, { videoId });
    expect(video?.status).toBe("needs_review");
    expect(video?.versions.map((v) => [v.number, v.note])).toEqual([
      [2, "Fixed the lighting"],
      [1, null],
    ]);
  });

  test("another creator cannot upload a version or rename", async () => {
    const { t, bob, boss, campaignId, videoId } = await setup();
    await expect(
      bob.as.mutation(api.videos.addVersion, {
        videoId,
        mediaId: await readyMedia(t, campaignId, bob.userId),
      }),
    ).rejects.toThrow("Only the creator or an admin");
    await expect(
      bob.as.mutation(api.videos.rename, { videoId, title: "Mine now" }),
    ).rejects.toThrow("Only the creator or an admin");
    await boss.as.mutation(api.videos.rename, { videoId, title: "Hook v2" });
    expect((await bob.as.query(api.videos.get, { videoId }))?.title).toBe(
      "Hook v2",
    );
  });

  test("a video or version is only added once its upload is ready", async () => {
    const { t, boss, alice, bob, campaignId, videoId, versionId } =
      await setup();
    await boss.as.mutation(api.videos.setStatus, {
      videoId,
      versionId,
      status: "approved",
    });
    const pending = await alice.as.mutation(api.media.start, {
      campaignId,
      contentType: "video/mp4",
    });
    await expect(
      alice.as.mutation(api.videos.addVersion, { videoId, mediaId: pending }),
    ).rejects.toThrow("hasn't finished");
    await expect(
      alice.as.mutation(api.videos.create, {
        campaignId,
        title: "Again",
        mediaId: pending,
      }),
    ).rejects.toThrow("hasn't finished");
    const bobs = await readyMedia(t, campaignId, bob.userId);
    await expect(
      alice.as.mutation(api.videos.addVersion, { videoId, mediaId: bobs }),
    ).rejects.toThrow("not yours");
    const video = await alice.as.query(api.videos.get, { videoId });
    expect(video?.status).toBe("approved");
    expect(video?.versions).toHaveLength(1);
    expect(await alice.as.query(api.videos.list, { campaignId })).toHaveLength(
      1,
    );
  });

  test("an upload cannot be used twice", async () => {
    const { t, alice, campaignId, videoId, versionId } = await setup();
    const mediaId = await readyMedia(t, campaignId, alice.userId);
    await alice.as.mutation(api.videos.addVersion, { videoId, mediaId });
    await expect(
      alice.as.mutation(api.videos.create, { campaignId, title: "x", mediaId }),
    ).rejects.toThrow("already used");
  });

  test("an older version cannot be approved once a newer one exists", async () => {
    const { t, boss, alice, campaignId, videoId, versionId } = await setup();
    await alice.as.mutation(api.videos.addVersion, {
      videoId,
      mediaId: await readyMedia(t, campaignId, alice.userId),
    });
    await expect(
      boss.as.mutation(api.videos.setStatus, {
        videoId,
        versionId,
        status: "approved",
      }),
    ).rejects.toThrow("newer version");
    expect((await boss.as.query(api.videos.get, { videoId }))?.status).toBe(
      "needs_review",
    );
  });
});
