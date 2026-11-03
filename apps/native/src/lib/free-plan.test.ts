// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccess } from "./free-plan";

const mocks = vi.hoisted(() => ({
  query: { data: undefined as unknown, isError: false },
}));

vi.mock("@convex/_generated/api", () => ({
  api: { freeSaves: { getFreeSaves: "getFreeSaves", freePlanOpen: "open" } },
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: false, loading: false }),
  usePaywallGuard: () => ({ guard: vi.fn(), loading: false }),
}));
vi.mock("@/lib/replay-onboarding", () => ({
  useAwaitingOnboardingPurchase: () => false,
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
}));

const free = { limit: 10, used: 3, left: 7, pending: 0, open: true };

describe("useAccess", () => {
  beforeEach(() => {
    mocks.query = { data: undefined, isError: false };
  });

  it("locks an account the server gives no free plan", () => {
    mocks.query = { data: null, isError: false };
    expect(renderHook(useAccess).result.current).toEqual({ kind: "locked" });
  });

  it("stays loading until the count arrives", () => {
    expect(renderHook(useAccess).result.current).toEqual({ kind: "loading" });
  });

  it("locks on an error with no count, and keeps a cached count through one", () => {
    mocks.query = { data: undefined, isError: true };
    expect(renderHook(useAccess).result.current).toEqual({ kind: "locked" });
    mocks.query = { data: free, isError: true };
    expect(renderHook(useAccess).result.current).toEqual({
      kind: "free",
      ...free,
    });
  });
});
