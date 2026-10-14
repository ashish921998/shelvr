// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSignOutWhenAccountGone } from "./account-gone";

const mock = vi.hoisted(() => ({
  isAuthenticated: true,
  currentUser: {
    data: undefined as { _id: string } | null | undefined,
    isSuccess: true,
    isFetching: false,
  },
  signOut: vi.fn(() => Promise.resolve()),
  captureError: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.isAuthenticated }),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: mock.signOut }),
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => mock.currentUser,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));

function state(data: { _id: string } | null | undefined, extra = {}) {
  mock.currentUser = { data, isSuccess: data !== undefined, isFetching: false };
  Object.assign(mock.currentUser, extra);
}

describe("useSignOutWhenAccountGone", () => {
  beforeEach(() => {
    mock.isAuthenticated = true;
    mock.signOut.mockReset().mockResolvedValue(undefined);
    mock.captureError.mockReset();
  });

  it("signs out once when a signed-in device's account no longer exists", () => {
    state(null);
    const { rerender } = renderHook(() => useSignOutWhenAccountGone());
    rerender();
    expect(mock.signOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the account exists", () => state({ _id: "users:1" })],
    ["the account check is pending", () => state(undefined)],
    ["a stale answer is refetching", () => state(null, { isFetching: true })],
    [
      "the device is already signed out",
      () => {
        mock.isAuthenticated = false;
        state(null);
      },
    ],
  ])("does nothing while %s", (_case, arrange) => {
    arrange();
    renderHook(() => useSignOutWhenAccountGone());
    expect(mock.signOut).not.toHaveBeenCalled();
  });

  it("reports a failed local sign-out", async () => {
    const error = new Error("storage");
    mock.signOut.mockRejectedValue(error);
    state(null);
    renderHook(() => useSignOutWhenAccountGone());
    await vi.waitFor(() =>
      expect(mock.captureError).toHaveBeenCalledWith(
        "account_gone_sign_out_failed",
        error,
      ),
    );
  });
});
