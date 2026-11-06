// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useDeleteTripPlan } from "./delete-trip-plan";

const mocks = vi.hoisted(() => ({
  deleteTripPlan: vi.fn(),
  alert: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { tripPlannerData: { deleteTripPlan: "deleteTripPlan" } },
}));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.deleteTripPlan,
}));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

const TRIP = "trip1" as Id<"tripPlans">;

function confirmDelete(onDeleted?: () => void) {
  const { result } = renderHook(useDeleteTripPlan);
  result.current(TRIP, onDeleted);
  const buttons = mocks.alert.mock.calls[0][2] as {
    style: string;
    onPress?: () => void;
  }[];
  buttons.find((button) => button.style === "destructive")?.onPress?.();
}

beforeEach(() => vi.clearAllMocks());

it("stays quiet until the person confirms the delete", () => {
  const { result } = renderHook(useDeleteTripPlan);
  result.current(TRIP);
  expect(mocks.deleteTripPlan).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});

it("confirms a delete once the server has removed the trip", async () => {
  mocks.deleteTripPlan.mockResolvedValueOnce(null);
  const onDeleted = vi.fn();
  confirmDelete(onDeleted);
  await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(mocks.success).toHaveBeenCalledOnce();
});

it("stays quiet and explains when the delete fails", async () => {
  mocks.deleteTripPlan.mockRejectedValueOnce(new Error("offline"));
  confirmDelete();
  await vi.waitFor(() => expect(mocks.alert).toHaveBeenCalledTimes(2));
  expect(mocks.success).not.toHaveBeenCalled();
});
