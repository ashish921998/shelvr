// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestConvexForDataModel } from "convex-test";
import { newConvexTest } from "./test.setup";

import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { MAX_CAPTURE_TOKENS_PER_USER } from "./appIntents";
import { sha256Hex } from "./model/captureTokens";

type TestCtx = TestConvexForDataModel<DataModel>;

// Keep scheduled jobs queued (see items.test.ts): the rows stay assertable
// without the AI action firing during teardown.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

const OP = "siri:11111111-1111-4111-8111-111111111111";
const OP_2 = "siri:22222222-2222-4222-8222-222222222222";

/** A signed-in user with a real users row, Pro unless `pro` is false, and a
 * freshly issued capture token. */
async function setup(options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const userId = await base.run((ctx) => ctx.db.insert("users", {}));
  const t = base.withIdentity({ subject: `${userId}|session-1` });
  if (options.pro !== false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("subscriptions", {
        userId,
        status: "pro",
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
        updatedAt: Date.now(),
      });
    });
  }
  const token = await t.action(api.appIntents.issueCaptureToken, {});
  return { base, t, userId, token };
}

function post(
  t: TestCtx,
  path: string,
  body: unknown,
  token?: string,
): Promise<Response> {
  return t.fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

async function scheduledProcessRuns(t: TestCtx) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs.filter((job) => job.name === "ai:processItem");
}

describe("capture tokens", () => {
  it("stores only the token's hash", async () => {
    const { t, userId, token } = await setup();
    const rows = await t.run((ctx) => ctx.db.query("captureTokens").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    expect(rows[0].tokenHash).toBe(await sha256Hex(token));
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("keeps only the newest tokens per user", async () => {
    const { t } = await setup();
    const tokens: string[] = [];
    for (let i = 0; i < MAX_CAPTURE_TOKENS_PER_USER + 2; i++) {
      tokens.push(await t.action(api.appIntents.issueCaptureToken, {}));
    }
    const rows = await t.run((ctx) => ctx.db.query("captureTokens").collect());
    expect(rows).toHaveLength(MAX_CAPTURE_TOKENS_PER_USER);
    const oldest = await post(
      t,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "hi" },
      tokens[0],
    );
    expect(oldest.status).toBe(401);
  });

  it("stops capturing once revoked", async () => {
    const { t, token } = await setup();
    await t.mutation(api.appIntents.revokeCaptureToken, { token });
    const response = await post(
      t,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "hi" },
      token,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("never revokes another user's token", async () => {
    const { base, t: owner, token } = await setup();
    const otherId = await base.run((ctx) => ctx.db.insert("users", {}));
    const other = base.withIdentity({ subject: `${otherId}|session-1` });
    await other.mutation(api.appIntents.revokeCaptureToken, { token });
    const response = await post(
      owner,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "still mine" },
      token,
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /app-intents/capture", () => {
  it("rejects a missing or unknown token", async () => {
    const { t } = await setup();
    const body = { operationId: OP, kind: "note", text: "hi" };
    expect((await post(t, "/app-intents/capture", body)).status).toBe(401);
    expect(
      (await post(t, "/app-intents/capture", body, "not-a-real-token")).status,
    ).toBe(401);
    const items = await t.run((ctx) => ctx.db.query("items").collect());
    expect(items).toHaveLength(0);
  });

  it("saves a link for the token's user, once per operation", async () => {
    const { t, userId, token } = await setup();
    const body = {
      operationId: OP,
      kind: "link",
      url: "https://example.com/recipe",
    };
    const first = await post(t, "/app-intents/capture", body, token);
    expect(first.status).toBe(200);
    const { itemId } = (await first.json()) as { itemId: Id<"items"> };

    // Siri retried after a timeout: the same operation returns the same save.
    const retry = await post(t, "/app-intents/capture", body, token);
    expect(await retry.json()).toEqual({ itemId });

    const items = await t.run((ctx) => ctx.db.query("items").collect());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      _id: itemId,
      userId,
      type: "link",
      url: "https://example.com/recipe",
      status: "processing",
    });
    expect(await scheduledProcessRuns(t)).toHaveLength(1);
  });

  it("refuses without Pro, like the share sheet", async () => {
    const { t, token } = await setup({ pro: false });
    const response = await post(
      t,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "a thought" },
      token,
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "pro_required" });
    const items = await t.run((ctx) => ctx.db.query("items").collect());
    expect(items).toHaveLength(0);
  });

  it("files a note into the user's own space and ignores a foreign one", async () => {
    const { t, userId, token } = await setup();
    const [mine, theirs] = await t.run(async (ctx) => {
      const otherId = await ctx.db.insert("users", {});
      return [
        await ctx.db.insert("spaces", { userId, name: "Trips" }),
        await ctx.db.insert("spaces", { userId: otherId, name: "Theirs" }),
      ];
    });

    const filed = await post(
      t,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "ramen on 5th", spaceId: mine },
      token,
    );
    const stray = await post(
      t,
      "/app-intents/capture",
      {
        operationId: OP_2,
        kind: "note",
        text: "not theirs",
        spaceId: theirs,
      },
      token,
    );
    expect(filed.status).toBe(200);
    expect(stray.status).toBe(200);

    const memberships = await t.run((ctx) =>
      ctx.db.query("spaceItems").collect(),
    );
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ spaceId: mine, status: "saved" });
  });

  it("rejects malformed bodies", async () => {
    const { t, token } = await setup();
    for (const body of [
      null,
      [],
      { kind: "note", text: "no operation" },
      { operationId: OP, kind: "video", text: "x" },
      { operationId: OP, kind: "note", text: "   " },
      { operationId: OP, kind: "link" },
      { operationId: OP, kind: "note", text: "x", spaceId: 42 },
    ]) {
      const response = await post(t, "/app-intents/capture", body, token);
      expect(response.status).toBe(400);
    }
  });
});

describe("image capture", () => {
  async function upload(t: TestCtx): Promise<Id<"_storage">> {
    return await t.run((ctx) =>
      ctx.storage.store(
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], {
          type: "image/png",
        }),
      ),
    );
  }

  it("begins, finishes, and classifies with Siri's context", async () => {
    const { t, userId, token } = await setup();
    const begin = await post(
      t,
      "/app-intents/image/begin",
      { operationId: OP },
      token,
    );
    expect(begin.status).toBe(200);
    expect(await begin.json()).toHaveProperty("uploadUrl");

    const storageId = await upload(t);
    const finish = await post(
      t,
      "/app-intents/image/finish",
      {
        operationId: OP,
        storageId,
        aspectRatio: 0.5,
        context: "Siri: save this\n\nText in the image:\nMiso ramen",
      },
      token,
    );
    expect(finish.status).toBe(200);
    const { itemId } = (await finish.json()) as { itemId: Id<"items"> };

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item).toMatchObject({
      userId,
      type: "image",
      storageId,
      aspectRatio: 0.5,
    });
    const runs = await scheduledProcessRuns(t);
    expect(runs).toHaveLength(1);
    expect(runs[0].args[0]).toMatchObject({
      itemId,
      captureContext: "Siri: save this\n\nText in the image:\nMiso ramen",
    });

    // A retried begin after the save returns the finished item.
    const again = await post(
      t,
      "/app-intents/image/begin",
      { operationId: OP },
      token,
    );
    expect(await again.json()).toEqual({ itemId });
  });

  it("does not send a sticker's context to the classifier", async () => {
    const { t, token } = await setup();
    await post(t, "/app-intents/image/begin", { operationId: OP }, token);
    const storageId = await upload(t);
    const finish = await post(
      t,
      "/app-intents/image/finish",
      { operationId: OP, storageId, isSticker: true, context: "the chair" },
      token,
    );
    expect(finish.status).toBe(200);
    const runs = await scheduledProcessRuns(t);
    expect(runs[0].args[0].captureContext).toBeUndefined();
  });

  it("refuses to begin without Pro", async () => {
    const { t, token } = await setup({ pro: false });
    const begin = await post(
      t,
      "/app-intents/image/begin",
      { operationId: OP },
      token,
    );
    expect(begin.status).toBe(402);
  });

  it("rejects an empty upload with its save error code", async () => {
    const { t, token } = await setup();
    await post(t, "/app-intents/image/begin", { operationId: OP }, token);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([], { type: "image/png" })),
    );
    const finish = await post(
      t,
      "/app-intents/image/finish",
      { operationId: OP, storageId },
      token,
    );
    expect(finish.status).toBe(422);
    expect(await finish.json()).toEqual({ error: "image_empty" });
  });
});

describe("account deletion", () => {
  it("deletes the user's capture tokens", async () => {
    const { t, token } = await setup();
    await t.mutation(api.users.deleteCurrentUserAccount, {});
    const rows = await t.run((ctx) => ctx.db.query("captureTokens").collect());
    expect(rows).toHaveLength(0);
    const response = await post(
      t,
      "/app-intents/capture",
      { operationId: OP, kind: "note", text: "hi" },
      token,
    );
    expect(response.status).toBe(401);
  });
});
