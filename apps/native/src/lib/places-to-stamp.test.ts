// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHasPlacesToStamp } from "@/lib/places-to-stamp";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  result: { data: undefined as unknown[] | undefined, isError: false },
  args: [] as unknown[],
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
  mocks.result = { data: undefined, isError: false };
  mocks.args = [];
});

describe("useHasPlacesToStamp", () => {
  it("offers Already been only when a saved place is still unstamped", () => {
    mocks.result = { data: [{ name: "Tigre" }], isError: false };
    expect(has()).toBe(true);
  });

  it("hides it when every saved place is stamped or nothing is saved", () => {
    mocks.result = { data: [], isError: false };
    expect(has()).toBe(false);
  });

  it("hides it while the places load, so it never flashes away", () => {
    expect(has()).toBe(false);
  });

  it("keeps it when the places fail to load, so the sheet can say so", () => {
    mocks.result = { data: undefined, isError: true };
    expect(has()).toBe(true);
  });

  it("asks for nothing while signed out", () => {
    mocks.authenticated = false;
    has();
    expect(mocks.args).toEqual(["skip"]);
  });
});
