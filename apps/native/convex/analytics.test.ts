// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest";
import { newConvexTest } from "./test.setup";
import { internal } from "./_generated/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("save telemetry delivery", () => {
  it("retries delivery with the same event UUID and original save time", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://analytics.example");
    vi.stubEnv("OBSERVABILITY_ENV", "development");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "qa",
        type: "note",
        status: "ready",
        tags: [],
        searchText: "",
      }),
    );
    const args = {
      itemId,
      userId: "qa",
      itemType: "note" as const,
      savedAt: 1000,
      sessionId: "save-session",
    };
    await t.action(internal.analytics.captureSave, args);
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(jobs).toHaveLength(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(firstBody.timestamp).toBe("1970-01-01T00:00:01.000Z");
    expect(jobs[0].args).toEqual([
      { ...args, attempt: 1, eventId: firstBody.uuid },
    ]);
    await t.action(internal.analytics.captureSave, {
      ...args,
      attempt: 1,
      eventId: firstBody.uuid,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(firstBody);
    expect(firstBody.properties.save_session_id).toBe("save-session");
    expect(firstBody.properties.environment).toBe("development");
  });

  it("is a no-op when analytics is not configured", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = newConvexTest();
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId: "qa",
        type: "note",
        status: "ready",
        tags: [],
        searchText: "",
      }),
    );
    await t.action(internal.analytics.captureSave, {
      itemId,
      userId: "qa",
      itemType: "note",
      savedAt: 1000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
