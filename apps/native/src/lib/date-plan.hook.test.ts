// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useDatePlan } from "./date-plan";

const mocks = vi.hoisted(() => ({
  make: vi.fn(),
  denied: vi.fn(),
  passed: vi.fn(),
  placement: "",
}));
vi.mock("convex/react", () => ({ useAction: () => mocks.make }));
vi.mock("@convex/_generated/api", () => ({ api: { datePlans: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/pro-gate", () => ({
  useProGate: (placement: string) => {
    mocks.placement = placement;
    return { denied: mocks.denied, passed: mocks.passed };
  },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const PRO_REQUIRED = new ConvexError({ code: "pro_required" });
const READY = {
  status: "ready",
  city: "Lisbon",
  kind: "classic",
  stops: [],
  evenings: [{ first: 0, second: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.make.mockResolvedValue(READY);
});

it("hands a Pro refusal to the make_plan gate and stays quiet when it opens the paywall", async () => {
  mocks.make.mockRejectedValue(PRO_REQUIRED);
  mocks.denied.mockResolvedValue(true);
  const { result } = renderHook(() => useDatePlan("Lisbon", "en"));
  await act(() => result.current.plan("classic"));
  expect(mocks.placement).toBe("make_plan");
  expect(mocks.denied).toHaveBeenCalledWith(PRO_REQUIRED);
  expect(result.current.state).toEqual({ status: "picking", problem: null });
  expect(mocks.passed).not.toHaveBeenCalled();
});

it("asks to try again when the server wants Pro the app already sees", async () => {
  mocks.make.mockRejectedValue(PRO_REQUIRED);
  mocks.denied.mockResolvedValue(false);
  const { result } = renderHook(() => useDatePlan("Lisbon", "en"));
  await act(() => result.current.plan("classic"));
  expect(result.current.state).toEqual({
    status: "picking",
    problem: "error",
  });
});

it("reports a pass for a plan of the person's own saves, not a shared list's", async () => {
  const own = renderHook(() => useDatePlan("Lisbon", "en"));
  await act(() => own.result.current.plan("classic"));
  expect(mocks.passed).toHaveBeenCalledOnce();

  const list = renderHook(() =>
    useDatePlan("Lisbon", "en", "list1" as Id<"sharedLists">),
  );
  await act(() => list.result.current.plan("classic"));
  expect(mocks.passed).toHaveBeenCalledOnce();
});
