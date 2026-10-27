// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCityPlan } from "./city-plan";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  ensureCitySpace: vi.fn(),
  guard: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  focus: undefined as (() => void) | undefined,
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.ensureCitySpace }));
vi.mock("@convex/_generated/api", () => ({ api: { spaces: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: mocks.guard, loading: false }),
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
  mocks.guard.mockResolvedValue(true);
});

it("opens the trip form once for a double tap on Plan a trip", async () => {
  const { result } = renderHook(() => useCityPlan("Lisbon"));
  await act(async () => {
    await Promise.all([
      result.current.start("trip"),
      result.current.start("trip"),
    ]);
  });
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith(TRIP_FORM);
  expect(result.current.busy).toBeNull();
});

it("opens the trip form again once the city page is back in focus", async () => {
  const { result } = renderHook(() => useCityPlan("Lisbon"));
  await act(() => result.current.start("trip"));
  await act(() => result.current.start("trip"));
  expect(mocks.push).toHaveBeenCalledTimes(1);

  act(() => mocks.focus?.());
  await act(() => result.current.start("trip"));
  expect(mocks.push).toHaveBeenCalledTimes(2);
});

it("opens one date plan for a double tap on Plan a date", async () => {
  mocks.ensureCitySpace.mockResolvedValue("space1");
  const { result } = renderHook(() => useCityPlan("Lisbon"));
  await act(async () => {
    await Promise.all([
      result.current.start("date"),
      result.current.start("date"),
    ]);
  });
  expect(mocks.ensureCitySpace).toHaveBeenCalledTimes(1);
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/plan/[id]",
    params: { id: "space1", city: "Lisbon" },
  });
  expect(result.current.busy).toBeNull();
});
