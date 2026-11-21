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

describe("comments", () => {
  test("a timestamped note shows to everyone with the author's role", async () => {
    const { boss, bob, versionId } = await setup();
    await boss.as.mutation(api.comments.add, {
      versionId,
      body: "Too dark here, face the window",
      timestamp: 12.345,
    });
    const seen = await bob.as.query(api.comments.list, { versionId });
    expect(seen).toMatchObject([
      {
        authorName: "boss",
        authorRole: "admin",
        timestamp: 12.3,
        body: "Too dark here, face the window",
        isMine: false,
        canModerate: false,
        resolved: false,
        recording: null,
      },
    ]);
  });

  test("replies attach to the top comment and drop their timestamp", async () => {
    const { boss, alice, bob, versionId } = await setup();
    const commentId = await boss.as.mutation(api.comments.add, {
      versionId,
      body: "Cut this pause",
      timestamp: 3,
    });
    const replyId = await alice.as.mutation(api.comments.add, {
      versionId,
      body: "On it",
      parentId: commentId,
      timestamp: 9,
    });
    await bob.as.mutation(api.comments.add, {
      versionId,
      body: "+1",
      parentId: replyId,
    });
    const rows = await alice.as.query(api.comments.list, { versionId });
    const replies = rows.filter((r) => r.parentId !== null);
    expect(replies).toHaveLength(2);
    expect(replies.every((r) => r.parentId === commentId)).toBe(true);
    expect(replies.every((r) => r.timestamp === null)).toBe(true);
  });

  test("a recording comment carries its finished upload", async () => {
    const { t, boss, campaignId, versionId } = await setup();
    const mediaId = await readyMedia(t, campaignId, boss.userId);
    await boss.as.mutation(api.comments.add, {
      versionId,
      body: "",
      timestamp: 4,
      mediaId,
    });
    const rows = await boss.as.query(api.comments.list, { versionId });
    expect(rows[0].recording).toMatchObject({ _id: mediaId, status: "ready" });
    await expect(
      boss.as.mutation(api.comments.add, { versionId, body: "", mediaId }),
    ).rejects.toThrow("already used");
  });

  test("a recording that hasn't finished uploading posts nothing", async () => {
    const { boss, campaignId, versionId } = await setup();
    const mediaId = await boss.as.mutation(api.media.start, {
      campaignId,
      contentType: "video/webm",
    });
    await expect(
      boss.as.mutation(api.comments.add, { versionId, body: "", mediaId }),
    ).rejects.toThrow("hasn't finished");
    expect(await boss.as.query(api.comments.list, { versionId })).toEqual([]);
  });

  test("an empty note without a recording is refused", async () => {
    const { boss, versionId } = await setup();
    await expect(
      boss.as.mutation(api.comments.add, { versionId, body: "   " }),
    ).rejects.toThrow("Write something");
  });

  test("outsiders cannot read or write", async () => {
    const { outsider, versionId } = await setup();
    expect(await outsider.as.query(api.comments.list, { versionId })).toEqual(
      [],
    );
    await expect(
      outsider.as.mutation(api.comments.add, { versionId, body: "hi" }),
    ).rejects.toThrow("not in this campaign");
  });

  test("the video's creator can resolve; another creator cannot", async () => {
    const { boss, alice, bob, versionId } = await setup();
    const commentId = await boss.as.mutation(api.comments.add, {
      versionId,
      body: "Reframe",
      timestamp: 1,
    });
    await expect(
      bob.as.mutation(api.comments.setResolved, { commentId, resolved: true }),
    ).rejects.toThrow("Only admins, the creator or the author");
    await alice.as.mutation(api.comments.setResolved, {
      commentId,
      resolved: true,
    });
    const rows = await bob.as.query(api.comments.list, { versionId });
    expect(rows[0].resolved).toBe(true);
  });

  test("deleting a comment removes its replies; only author or admin", async () => {
    const { boss, alice, bob, versionId } = await setup();
    const commentId = await alice.as.mutation(api.comments.add, {
      versionId,
      body: "Question about the hook",
    });
    await boss.as.mutation(api.comments.add, {
      versionId,
      body: "Answer",
      parentId: commentId,
    });
    await expect(
      bob.as.mutation(api.comments.remove, { commentId }),
    ).rejects.toThrow("Only the author or an admin");
    await alice.as.mutation(api.comments.remove, { commentId });
    expect(await alice.as.query(api.comments.list, { versionId })).toEqual([]);
  });
});
