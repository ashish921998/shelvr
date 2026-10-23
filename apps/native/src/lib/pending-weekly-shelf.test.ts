// The weekly shelf onboarding promised is turned on at the first signed-in
// launch, once, and only while notifications are still allowed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  permission: vi.fn<() => Promise<"granted" | "ask" | "blocked">>(),
  captureError: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.store.get(key) ?? null,
  setItem: (key: string, value: string) => mock.store.set(key, value),
}));
vi.mock("@/lib/notification-token", () => ({
  notificationPermissionState: mock.permission,
}));
vi.mock("@/lib/notifications", () => ({ useNotificationSession: vi.fn() }));
vi.mock("convex/react", () => ({ useConvexAuth: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));

const { applyQueuedWeeklyShelf, queueWeeklyShelf } =
  await import("./pending-weekly-shelf");

beforeEach(() => {
  mock.store.clear();
  mock.permission.mockReset().mockResolvedValue("granted");
  mock.captureError.mockReset();
});

describe("applyQueuedWeeklyShelf", () => {
  it("does nothing when onboarding queued nothing", async () => {
    const set = vi.fn();
    await applyQueuedWeeklyShelf(set);
    expect(set).not.toHaveBeenCalled();
  });

  it("turns the shelf on once, then forgets the request", async () => {
    queueWeeklyShelf();
    const set = vi.fn().mockResolvedValue(true);
    await applyQueuedWeeklyShelf(set);
    await applyQueuedWeeklyShelf(set);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(true);
  });

  it("drops the request when notifications were turned off since", async () => {
    queueWeeklyShelf();
    mock.permission.mockResolvedValue("blocked");
    const set = vi.fn();
    await applyQueuedWeeklyShelf(set);
    mock.permission.mockResolvedValue("granted");
    await applyQueuedWeeklyShelf(set);
    expect(set).not.toHaveBeenCalled();
  });

  it("keeps the request for the next launch when the session is busy", async () => {
    queueWeeklyShelf();
    const set = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true);
    await applyQueuedWeeklyShelf(set);
    await applyQueuedWeeklyShelf(set);
    expect(set).toHaveBeenCalledTimes(2);
    expect(mock.captureError).toHaveBeenCalledTimes(1);
  });
});
