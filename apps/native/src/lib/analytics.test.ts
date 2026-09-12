import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analytics } from "./analytics";

const mock = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  getSessionId: vi.fn(() => "session-1"),
}));
vi.mock("@/lib/posthog", () => ({ posthog: mock }));
vi.mock("activation-pal", () => ({
  activationPal: { track: vi.fn(), setUserId: vi.fn() },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { variant: "development" } } },
}));

const item = {
  _id: "item-1",
  _creationTime: 1000,
  type: "note" as const,
  note: "Private content",
  url: "https://private.example",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("item analytics", () => {
  it("links opens and actions without exposing content or source URLs", () => {
    analytics.itemOpened(item, "search");
    analytics.itemAction(item, "copy");
    expect(mock.capture).toHaveBeenNthCalledWith(1, "item_opened", {
      item_id: "item-1",
      item_type: "note",
      saved_at: 1000,
      item_age_ms: expect.any(Number),
      source: "search",
      environment: "development",
      analytics_version: 1,
    });
    expect(mock.capture).toHaveBeenNthCalledWith(2, "item_action", {
      item_id: "item-1",
      item_type: "note",
      saved_at: 1000,
      item_age_ms: expect.any(Number),
      action: "copy",
      environment: "development",
      analytics_version: 1,
    });
  });

  it("excludes development fixtures", () => {
    analytics.itemOpened({ ...item, fixtureKey: "qa" }, "direct");
    analytics.itemAction({ ...item, fixtureKey: "qa" }, "copy");
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("identifies by Convex user id only, never by email", () => {
    analytics.identify("user-1");
    expect(mock.identify).toHaveBeenCalledTimes(1);
    expect(mock.identify).toHaveBeenCalledWith("user-1");
    // Nothing shaped like a person-property payload (`$set`) or an address
    // may reach PostHog.
    expect(JSON.stringify(mock.identify.mock.calls)).not.toMatch(
      /\$set|email|@/,
    );
  });

  it("does not let unavailable analytics fail a save or an action", () => {
    mock.capture.mockImplementationOnce(() => {
      throw new Error("unavailable");
    });
    mock.getSessionId.mockImplementationOnce(() => {
      throw new Error("unavailable");
    });
    expect(analytics.sessionId()).toBeUndefined();
    expect(() => analytics.itemAction(item, "copy")).not.toThrow();
    mock.getSessionId.mockReturnValueOnce("");
    expect(analytics.sessionId()).toBeUndefined();
  });
});

describe("captureError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the class and stack but never a content-carrying message", () => {
    const error = new TypeError("Value: https://private.example/note text");
    analytics.captureError("share_save_failed", error, { entry_count: 2 });
    expect(console.error).toHaveBeenCalledWith("share_save_failed", error);
    expect(mock.captureException).toHaveBeenCalledTimes(1);
    const [reported, properties] = mock.captureException.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).name).toBe("TypeError");
    // The stack ships for symbolication; the message may not echo user data.
    expect((reported as Error).stack).toBe(error.stack);
    expect(JSON.stringify(mock.captureException.mock.calls)).not.toContain(
      "private.example",
    );
    expect(properties).toMatchObject({
      error_event: "share_save_failed",
      entry_count: 2,
      environment: "development",
      analytics_version: 1,
    });
  });

  it("passes through whitelisted fixed messages", () => {
    const error = new Error("Network request failed");
    analytics.captureError("image_upload_failed", error);
    expect(mock.captureException.mock.calls[0][0]).toBe(error);
  });

  it("reduces non-Error throws to their type", () => {
    analytics.captureError("sign_out_failed", "boom");
    const reported = mock.captureException.mock.calls[0][0] as Error;
    expect(reported.message).toBe("string");
  });

  it("never throws when error tracking is unavailable", () => {
    mock.captureException.mockImplementationOnce(() => {
      throw new Error("unavailable");
    });
    expect(() => analytics.captureError("x", new Error("y"))).not.toThrow();
  });
});
