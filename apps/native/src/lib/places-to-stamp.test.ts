// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHasPlacesToStamp } from "@/lib/places-to-stamp";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  result: {
    data: undefined as unknown[] | undefined,
    isError: false,
    error: null as Error | null,
  },
  args: [] as unknown[],
  captureError: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_fn: unknown, args: unknown) => args,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (args: unknown) => {
    mocks.args.push(args);
    return mocks.result;
  },
}));

const has = () => renderHook(() => useHasPlacesToStamp()).result.current;

beforeEach(() => {
  mocks.authenticated = true;
  mocks.result = { data: undefined, isError: false, error: null };
  mocks.args = [];
  mocks.captureError.mockReset();
});

describe("useHasPlacesToStamp", () => {
  it("offers Already been only when a saved place is still unstamped", () => {
    mocks.result = { data: [{ name: "Tigre" }], isError: false, error: null };
    expect(has()).toBe(true);
  });

  it("hides it when every saved place is stamped or nothing is saved", () => {
    mocks.result = { data: [], isError: false, error: null };
    expect(has()).toBe(false);
  });

  it("hides it while the places load, so it never flashes away", () => {
    expect(has()).toBe(false);
  });

  it("keeps it when the places fail to load, so the sheet can say so", () => {
    const error = new Error("load failed");
    mocks.result = { data: undefined, isError: true, error };
    expect(has()).toBe(true);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "passport_unstamped_load_failed",
      error,
    );
  });

  it("reports nothing when the places load", () => {
    mocks.result = { data: [], isError: false, error: null };
    has();
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it("asks for nothing while signed out", () => {
    mocks.authenticated = false;
    has();
    expect(mocks.args).toEqual(["skip"]);
  });
});
