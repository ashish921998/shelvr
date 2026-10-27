// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useCreateTripPlan } from "./create-trip-plan";
import { initialTripForm } from "./trip-planner";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  guard: vi.fn(),
  openPaywall: vi.fn(),
  replace: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("convex/react", () => ({ useAction: () => mocks.create }));
vi.mock("@convex/_generated/api", () => ({ api: { tripPlanner: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/entitlement", () => ({
  usePaywallGuard: () => ({ guard: mocks.guard, loading: false }),
  openPaywall: mocks.openPaywall,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const TRIP = "trip1" as Id<"tripPlans">;
const CITIES = [{ city: "Lisbon", count: 6 }];
const FORM = initialTripForm("Lisbon");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue(true);
});

it("plans the trip, then opens it once the reveal is done", async () => {
  mocks.create.mockResolvedValue({ tripId: TRIP, saves: 4, suggested: 6 });
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));

  expect(mocks.create).toHaveBeenCalledWith({
    city: "Lisbon",
    days: 3,
    pace: "balanced",
    interests: ["food", "coffee", "sights"],
    locale: "en",
  });
  expect(mocks.capture).toHaveBeenCalledWith(
    "trip_plan_started",
    expect.objectContaining({ saved_city: true, dated: false }),
  );
  expect(result.current.state).toEqual({
    status: "ready",
    city: "Lisbon",
    tripId: TRIP,
  });
  act(() => result.current.open());
  expect(mocks.replace).toHaveBeenCalledWith({
    pathname: "/trip-plan/[id]",
    params: { id: TRIP },
  });
});

it("stays on the form when there is nothing to plan in that city", async () => {
  mocks.create.mockResolvedValue({ tripId: null, saves: 0, suggested: 0 });
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));
  expect(result.current.state).toEqual({
    status: "idle",
    problem: { kind: "empty", city: "Lisbon" },
  });
  expect(mocks.captureError).not.toHaveBeenCalled();
});

it("reports a failed request and says so on the form", async () => {
  const failure = new Error("offline");
  mocks.create.mockRejectedValue(failure);
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));
  expect(result.current.state).toEqual({
    status: "idle",
    problem: { kind: "error" },
  });
  expect(mocks.captureError).toHaveBeenCalledWith(
    "create_trip_plan_failed",
    failure,
  );
});

it("shows the rate limit without reporting it as a crash", async () => {
  mocks.create.mockRejectedValue(new ConvexError({ kind: "RateLimited" }));
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));
  expect(result.current.state).toEqual({
    status: "idle",
    problem: { kind: "rate_limited" },
  });
  expect(mocks.captureError).not.toHaveBeenCalled();
});

it("opens the paywall when the server says Pro is needed", async () => {
  mocks.create.mockRejectedValue(
    new ConvexError({ code: "pro_required", message: "Pro required" }),
  );
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));
  expect(mocks.openPaywall).toHaveBeenCalledWith(
    expect.anything(),
    "plan_trip",
  );
  expect(result.current.state).toEqual({ status: "idle", problem: null });
});

it("does not plan without Pro or without a city", async () => {
  mocks.guard.mockResolvedValue(false);
  const { result } = renderHook(() => useCreateTripPlan("en", CITIES));
  await act(() => result.current.submit(FORM));
  expect(mocks.create).not.toHaveBeenCalled();

  await act(() => result.current.submit({ ...FORM, city: "" }));
  expect(result.current.state).toEqual({
    status: "idle",
    problem: { kind: "city" },
  });
  expect(mocks.guard).toHaveBeenCalledTimes(1);
});
