// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { useTripShare } from "@/lib/trip-share";

type Button = { text: string; onPress?: () => void };

const mocks = vi.hoisted(() => ({
  token: undefined as string | null | undefined,
  create: vi.fn(),
  revoke: vi.fn(),
  shareUrl: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/convex-url", () => ({
  readConvexUrl: () => "https://shelvr-test.convex.cloud",
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: mocks.shareUrl }));
vi.mock("@convex/_generated/api", () => ({
  api: {
    tripShares: {
      getShareToken: "getShareToken",
      createShare: "createShare",
      revokeShare: "revokeShare",
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.token,
  useMutation: (name: string) =>
    name === "createShare" ? mocks.create : mocks.revoke,
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));

const tripId = "trip1" as never;

const lastButtons = (): Button[] => mocks.alert.mock.lastCall?.[2] ?? [];
const press = (text: string) => {
  const button = lastButtons().find((entry) => entry.text === text);
  if (!button?.onPress) throw new Error(`No ${text} button`);
  act(() => button.onPress?.());
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  mocks.token = null;
  mocks.create.mockResolvedValue("tok1");
  mocks.revoke.mockResolvedValue(null);
  mocks.shareUrl.mockResolvedValue(undefined);
});

it("waits for the token before offering anything", () => {
  mocks.token = undefined;
  const { result } = renderHook(() => useTripShare(tripId));
  expect(result.current.loading).toBe(true);
  result.current.open();
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("creates a link for an unshared trip and shares it on the site URL", async () => {
  const { result } = renderHook(() => useTripShare(tripId));
  expect(result.current.revokeActive).toBeNull();
  result.current.open();
  expect(mocks.alert.mock.lastCall?.[1]).toBe("tripShare.create");
  expect(lastButtons().map((button) => button.text)).toEqual([
    "common.cancel",
    "common.share",
  ]);
  press("common.share");
  await waitFor(() =>
    expect(mocks.shareUrl).toHaveBeenCalledWith(
      "https://shelvr-test.convex.site/trip/shared/tok1",
    ),
  );
  expect(mocks.create).toHaveBeenCalledWith({ tripId });
});

it("offers Stop sharing for a shared trip and revokes only on confirm", async () => {
  mocks.token = "tok1";
  const { result } = renderHook(() => useTripShare(tripId));
  result.current.open();
  expect(mocks.alert.mock.lastCall?.[1]).toBe("tripShare.active");
  press("tripShare.revoke");
  expect(mocks.alert.mock.lastCall?.[1]).toBe("tripShare.revokeBody");
  expect(lastButtons().find((b) => b.text === "common.cancel")?.onPress).toBe(
    undefined,
  );
  expect(mocks.revoke).not.toHaveBeenCalled();
  press("tripShare.revoke");
  await waitFor(() =>
    expect(mocks.revoke).toHaveBeenCalledWith({ tripId, token: "tok1" }),
  );
});

it("revokes straight from revokeActive after confirming", async () => {
  mocks.token = "tok1";
  const { result } = renderHook(() => useTripShare(tripId));
  result.current.revokeActive?.();
  press("tripShare.revoke");
  await waitFor(() => expect(mocks.revoke).toHaveBeenCalledTimes(1));
});

it("reports a failed share and lets the next try through", async () => {
  const failure = new Error("createShare failed");
  mocks.create.mockRejectedValueOnce(failure);
  const { result } = renderHook(() => useTripShare(tripId));
  result.current.open();
  press("common.share");
  await waitFor(() =>
    expect(mocks.captureError).toHaveBeenCalledWith(
      "trip_share_failed",
      failure,
    ),
  );
  expect(mocks.alert).toHaveBeenLastCalledWith(
    "errors.unexpectedTitle",
    "errors.retrySoon",
  );
  expect(mocks.shareUrl).not.toHaveBeenCalled();
  result.current.open();
  press("common.share");
  await waitFor(() => expect(mocks.shareUrl).toHaveBeenCalledTimes(1));
});
