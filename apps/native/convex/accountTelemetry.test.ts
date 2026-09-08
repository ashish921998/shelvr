// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newConvexTest } from "./test.setup";
import { recordAccountCreated } from "./model/accountCreated";
import { internal } from "./_generated/api";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("account creation analytics", () => {
  it("records actual creation time and skips returning or linked users", async () => {
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await t.run((ctx) => recordAccountCreated(ctx, { userId, existingUserId: null }));
    await t.run((ctx) => recordAccountCreated(ctx, { userId, existingUserId: userId }));
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].args).toEqual([{ userId, createdAt: user?._creationTime }]);
  });

  it("retries the same signup without changing its time or event identity", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("OBSERVABILITY_ENV", "production");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await t.action(internal.accountTelemetry.capture, { userId, createdAt: 1000 });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(jobs).toHaveLength(1);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    await t.action(internal.accountTelemetry.capture, {
      userId, createdAt: 1000, deliveryId: first.uuid, attempt: 1,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(first);
    expect(first.event).toBe("account_created");
    expect(first.timestamp).toBe("1970-01-01T00:00:01.000Z");
    expect(first.properties.environment).toBe("production");
    expect(first.properties.distinct_id).toBe(userId);
  });

  it("labels development signups separately", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("OBSERVABILITY_ENV", "development");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    await t.action(internal.accountTelemetry.capture, { userId, createdAt: 1000 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).properties.environment).toBe("development");
  });
});
