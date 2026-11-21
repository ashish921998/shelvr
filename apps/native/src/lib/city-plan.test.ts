// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCityPlan } from "./city-plan";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  admit: vi.fn(),
  passed: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  focus: undefined as (() => void) | undefined,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/pro-gate", () => ({
  useProGate: () => ({ admit: mocks.admit, passed: mocks.passed }),
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  useFocusEffect: (callback: () => void) => {
    mocks.focus = callback;
  },
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

const TRIP_FORM = { pathname: "/new-trip", params: { city: "Lisbon" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.focus = undefined;
  mocks.admit.mockResolvedValue("go");
});

it("opens the trip form once for a double tap on Plan a trip", async () => {
  const { result } = renderHook(() => useCityPlan());
  await act(async () => {
    await Promise.all([
      result.current.start("trip", "Lisbon"),
      result.current.start("trip", "Lisbon"),
    ]);
  });
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith(TRIP_FORM);
  expect(mocks.capture).toHaveBeenCalledWith("city_plan_started", {
    kind: "trip",
    from: "direct",
  });
  expect(result.current.busy).toBeNull();
});

it("opens the trip form again once the city page is back in focus", async () => {
  const { result } = renderHook(() => useCityPlan());
  await act(() => result.current.start("trip", "Lisbon"));
  await act(() => result.current.start("trip", "Lisbon"));
  expect(mocks.push).toHaveBeenCalledTimes(1);

  act(() => mocks.focus?.());
  await act(() => result.current.start("trip", "Lisbon"));
  expect(mocks.push).toHaveBeenCalledTimes(2);
});

it("runs the plan check before leaving, then opens the planner", async () => {
  const order: string[] = [];
  mocks.admit.mockImplementation(async () => {
    order.push("check");
    return "go";
  });
  mocks.push.mockImplementation(() => order.push("open"));
  const { result } = renderHook(() => useCityPlan());
  await act(() =>
    result.current.start("date", "Lisbon", () => order.push("leave")),
  );
  expect(order).toEqual(["check", "leave", "open"]);
});

it("stays put when the paywall stops the plan", async () => {
  mocks.admit.mockResolvedValue("paywalled");
  const leave = vi.fn();
  const { result } = renderHook(() => useCityPlan());
  await act(() => result.current.start("trip", "Lisbon", leave));
  expect(leave).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("opens one picker for a double tap on Go out", async () => {
  const { result } = renderHook(() => useCityPlan());
  await act(async () => {
    await Promise.all([
      result.current.start("date", "Lisbon"),
      result.current.start("date", "Lisbon"),
    ]);
  });
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/go-out",
    params: { city: "Lisbon" },
  });
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.passed).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBeNull();
});
