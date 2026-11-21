// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { addMember, addUser, newConvexTest } from "./test.setup";

const SECRET = "whsec_test";

async function sign(body: string, timestamp: number) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REVIEW_STAFF_EMAILS", "boss@shelvr.app");
  vi.stubEnv("MUX_WEBHOOK_SECRET", SECRET);
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
  const outsider = await addUser(t, "eve@example.com");
  const { videoId, mediaId } = await alice.as.mutation(api.videos.create, {
    campaignId,
    title: "Hook",
  });
  return { t, boss, alice, outsider, campaignId, videoId, mediaId };
}

async function deliver(
  t: ReturnType<typeof newConvexTest>,
  payload: unknown,
  signature?: string,
) {
  const body = JSON.stringify(payload);
  const now = Math.floor(Date.now() / 1000);
  return t.fetch("/mux/webhook", {
    method: "POST",
    headers: { "mux-signature": signature ?? (await sign(body, now)) },
    body,
  });
}

describe("mux webhook", () => {
  test("a ready asset makes the video playable for members only", async () => {
    const { t, alice, outsider, campaignId, mediaId } = await setup();
    const created = await deliver(t, {
      type: "video.upload.asset_created",
      data: {
        asset_id: "asset1",
        new_asset_settings: { passthrough: mediaId },
      },
    });
    expect(created.status).toBe(204);
    let list = await alice.as.query(api.videos.list, { campaignId });
    expect(list[0].media?.status).toBe("processing");

    await deliver(t, {
      type: "video.asset.ready",
      data: {
        id: "asset1",
        passthrough: mediaId,
        duration: 31.2,
        aspect_ratio: "9:16",
        playback_ids: [{ id: "play1", policy: "signed" }],
      },
    });
    list = await alice.as.query(api.videos.list, { campaignId });
    expect(list[0].media).toMatchObject({
      status: "ready",
      duration: 31.2,
      aspectRatio: "9:16",
    });
    expect(
      await alice.as.query(internal.media.playable, { mediaIds: [mediaId] }),
    ).toEqual([{ mediaId, playbackId: "play1" }]);
    expect(
      await outsider.as.query(internal.media.playable, { mediaIds: [mediaId] }),
    ).toEqual([]);
  });

  test("a bad signature is refused and changes nothing", async () => {
    const { t, alice, campaignId, mediaId } = await setup();
    const response = await deliver(
      t,
      { type: "video.asset.errored", data: { id: "a", passthrough: mediaId } },
      "t=1,v1=00",
    );
    expect(response.status).toBe(401);
    const list = await alice.as.query(api.videos.list, { campaignId });
    expect(list[0].media?.status).toBe("waiting");
  });

  test("an errored asset is marked so the uploader can retry", async () => {
    const { t, alice, campaignId, mediaId } = await setup();
    await deliver(t, {
      type: "video.asset.errored",
      data: { id: "a", passthrough: mediaId },
    });
    const list = await alice.as.query(api.videos.list, { campaignId });
    expect(list[0].media?.status).toBe("errored");
  });

  test("only the uploader can start the upload, once", async () => {
    const { t, boss, alice, mediaId } = await setup();
    expect(
      await boss.as.query(internal.media.uploadTarget, { mediaId }),
    ).toBeNull();
    expect(
      await alice.as.query(internal.media.uploadTarget, { mediaId }),
    ).not.toBeNull();
    await t.mutation(internal.media.recordUpload, {
      mediaId,
      muxUploadId: "up1",
    });
    expect(
      await alice.as.query(internal.media.uploadTarget, { mediaId }),
    ).toBeNull();
  });
});
