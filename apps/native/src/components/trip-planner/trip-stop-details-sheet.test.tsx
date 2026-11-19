// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { TripStopDetailsSheet } from "@/components/trip-planner/trip-stop-details-sheet";
import { saveError } from "@convex/model/saveErrors";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
  openPaywall: vi.fn(),
}));

vi.mock("@/lib/entitlement", () => ({
  openPaywall: mocks.openPaywall,
  waitForSheetTransition: () => Promise.resolve(),
}));
vi.mock("expo-router", () => ({ useRouter: () => "router" }));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("convex/react", () => ({ useMutation: () => mocks.update }));
vi.mock("@convex/_generated/api", () => ({
  api: { tripPlannerData: { updateTripStopDetails: "update" } },
}));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({ children, actions }: { children: ReactNode; actions: ReactNode }) => (
      <div>
        {children}
        {actions}
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  )),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      disabled,
      onPress,
    }: {
      title: string;
      disabled?: boolean;
      onPress: () => void;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("react-native", async () => ({
  ...(await import("@/test-native")).reactNative,
  Alert: { alert: mocks.alert },
}));

const stop = {
  _id: "stop1",
  name: "Franklin Barbecue",
  time: "12:00",
  note: "Get there early",
} as never;

const renderSheet = () => {
  const onClose = vi.fn();
  render(<TripStopDetailsSheet stop={stop} onClose={onClose} />);
  return onClose;
};
const field = (label: string) => screen.getByLabelText(label);
const save = () => screen.getByRole("button", { name: "common.save" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(null);
});

it("saves the edited time and trimmed note, then closes", async () => {
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopTime"), {
    target: { value: "18:30" },
  });
  fireEvent.change(field("tripPlanner.stopNote"), {
    target: { value: "  Book a table  " },
  });
  fireEvent.click(save());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledWith({
    stopId: "stop1",
    time: "18:30",
    note: "Book a table",
  });
});

it("sends only changed fields so a stale note cannot overwrite a newer one", async () => {
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopTime"), {
    target: { value: "18:30" },
  });
  fireEvent.click(save());
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(mocks.update).toHaveBeenCalledWith({ stopId: "stop1", time: "18:30" });
});

it("closes without writing when nothing changed", () => {
  const onClose = renderSheet();
  fireEvent.click(save());
  expect(onClose).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("sends null for cleared fields", async () => {
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopTime"), { target: { value: "" } });
  fireEvent.change(field("tripPlanner.stopNote"), { target: { value: "  " } });
  fireEvent.click(save());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(mocks.update).toHaveBeenCalledWith({
    stopId: "stop1",
    time: null,
    note: null,
  });
});

it("blocks an invalid time and says why", () => {
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopTime"), {
    target: { value: "25:00" },
  });
  expect(screen.getByText("tripPlanner.stopTimeInvalid")).toBeTruthy();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save());
  expect(mocks.update).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it("stays open and reports a failed save", async () => {
  const failure = new Error("updateTripStopDetails failed");
  mocks.update.mockRejectedValue(failure);
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopNote"), {
    target: { value: "New note" },
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(mocks.alert).toHaveBeenCalledWith("tripPlanner.editFailed"),
  );
  expect(mocks.captureError).toHaveBeenCalledWith(
    "trip_stop_details_failed",
    failure,
  );
  expect(onClose).not.toHaveBeenCalled();
});

it("closes and opens the paywall when the trip needs Pro", async () => {
  mocks.update.mockRejectedValue(saveError("pro_required"));
  const onClose = renderSheet();
  fireEvent.change(field("tripPlanner.stopNote"), {
    target: { value: "New note" },
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(mocks.openPaywall).toHaveBeenCalledWith(
      "router",
      "trip_stop_details",
    ),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(mocks.captureError).not.toHaveBeenCalled();
});
