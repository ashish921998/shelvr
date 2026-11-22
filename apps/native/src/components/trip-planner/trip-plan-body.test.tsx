// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { TripPlanBody } from "@/components/trip-planner/trip-plan-body";

const mocks = vi.hoisted(() => ({
  moveStop: vi.fn(),
  removeStop: vi.fn(),
  add: vi.fn(),
  places: undefined as unknown,
  placesArgs: [] as unknown[],
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: vi.fn(), success: vi.fn() },
}));
vi.mock("@/lib/apple-place-card", () => ({ canOpenPlaceCard: () => false }));
vi.mock("@/lib/use-place-opener", () => ({
  usePlaceOpener: () => ({ open: vi.fn() }),
}));
vi.mock("@/lib/trip-edit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trip-edit")>()),
  useTripEditor: () => ({
    moveStop: mocks.moveStop,
    removeStop: mocks.removeStop,
    undo: null,
    undoLast: vi.fn(),
  }),
  useAddTripStop: () => mocks.add,
}));
vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    mocks.placesArgs.push(args);
    return args === "skip" ? undefined : mocks.places;
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { tripPlannerData: { tripSavePlaces: "tripSavePlaces" } },
}));
vi.mock("expo-router", () => ({ useIsFocused: () => true }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    theme: { colors: { tripDays: ["#a", "#b", "#c"] } },
    rt: { screen: { height: 800 } },
  }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      accessibilityLabel,
      onPress,
      disabled,
    }: {
      children: ReactNode;
      accessibilityLabel?: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/undo-bar", () => ({ UndoBar: vi.fn(() => null) }));
vi.mock("@/components/trip-planner/chip", () => ({
  Chip: vi.fn(({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{`tab ${label}`}</button>
  )),
}));
vi.mock("@/components/trip-planner/trip-stop-row", () => ({
  TripStopRow: vi.fn(
    ({ stop, action }: { stop: { name: string }; action: ReactNode }) => (
      <div>
        <span>{stop.name}</span>
        {action}
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(
    ({
      label,
      actions,
    }: {
      label: string;
      actions: { label: string; onPress: () => void }[];
    }) => (
      <div aria-label={label}>
        {actions.map((action) => (
          <button key={action.label} onClick={action.onPress}>
            {`${label}: ${action.label}`}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/components/trip-planner/trip-planner-map", async () => {
  const { useState } = await import("react");
  function TripPlannerMap({ activeDay }: { activeDay: number | null }) {
    const [pin, setPin] = useState<string>();
    return (
      <>
        <div>{`map ${activeDay}`}</div>
        <button onClick={() => setPin("Barton Springs")}>tap pin</button>
        {pin ? <p>{`map focused on ${pin}`}</p> : null}
      </>
    );
  }
  return { TripPlannerMap };
});
vi.mock("@/components/trip-planner/trip-stop-details-sheet", () => ({
  TripStopDetailsSheet: vi.fn(({ stop }: { stop: { name: string } }) => (
    <div>{`details ${stop.name}`}</div>
  )),
}));
vi.mock("@/components/trip-planner/trip-day-preview", () => ({
  TripDayPreview: vi.fn(
    ({ day, places }: { day: number; places: { name: string }[] }) => (
      <div>{`preview day ${day}: ${places.map((p) => p.name).join(", ")}`}</div>
    ),
  ),
}));

const stop = (id: string, name: string) => ({
  _id: id,
  name,
  source: "save",
  lat: 30.27,
  lng: -97.74,
});
const trip = {
  _id: "trip1",
  city: "Austin",
  dayCount: 2,
  pace: "balanced",
  days: [[stop("a", "Franklin Barbecue"), stop("b", "Barton Springs")], []],
  unplanned: [],
} as never;
const savePlace = { itemId: "item1", name: "Veracruz Tacos" };

const renderBody = (
  day: number | null,
  options: { canUseSaves?: boolean; canFillFromSaves?: boolean } = {},
) => {
  const onPickDay = vi.fn();
  const onAddPlace = vi.fn();
  render(
    <TripPlanBody
      trip={trip}
      canUseSaves={options.canUseSaves ?? true}
      canFillFromSaves={options.canFillFromSaves ?? true}
      day={day}
      onPickDay={onPickDay}
      onAddPlace={onAddPlace}
    />,
  );
  return { onPickDay, onAddPlace };
};
const button = (name: string) => screen.getByRole("button", { name });
const menu = (stopName: string, action: string) =>
  button(
    `tripPlanner.stopActions ${JSON.stringify({ name: stopName })}: ${action}`,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.places = [savePlace];
  mocks.placesArgs = [];
  mocks.add.mockResolvedValue(true);
});

it("picks a day from its tab and the overview from its own", () => {
  const { onPickDay } = renderBody(0);
  fireEvent.click(button(`tab trip.dayTab ${JSON.stringify({ day: "2" })}`));
  expect(onPickDay).toHaveBeenLastCalledWith(1);
  fireEvent.click(button("tab tripDay.overview"));
  expect(onPickDay).toHaveBeenLastCalledWith(null);
});

it("opens a day from its overview row", () => {
  const { onPickDay } = renderBody(null);
  fireEvent.click(
    screen.getAllByRole("button", {
      name: (name) => name.includes("trip.stopCount"),
    })[1],
  );
  expect(onPickDay).toHaveBeenCalledWith(1);
});

it("moves a stop within its day and to another day from its menu", () => {
  renderBody(0);
  fireEvent.click(menu("Franklin Barbecue", "tripPlanner.moveDown"));
  expect(mocks.moveStop).toHaveBeenLastCalledWith(
    "a",
    { day: 1, index: 1 },
    "menu",
  );
  fireEvent.click(menu("Barton Springs", "tripPlanner.moveUp"));
  expect(mocks.moveStop).toHaveBeenLastCalledWith(
    "b",
    { day: 1, index: 0 },
    "menu",
  );
  fireEvent.click(
    menu(
      "Barton Springs",
      `tripPlanner.moveToDay ${JSON.stringify({ day: `trip.dayTab ${JSON.stringify({ day: "2" })}` })}`,
    ),
  );
  expect(mocks.moveStop).toHaveBeenLastCalledWith(
    "b",
    { day: 2, index: Number.MAX_SAFE_INTEGER },
    "menu",
  );
  expect(() => menu("Franklin Barbecue", "tripPlanner.moveUp")).toThrow();
  expect(() => menu("Barton Springs", "tripPlanner.moveDown")).toThrow();
});

it("removes a stop and opens its details from its menu", () => {
  renderBody(0);
  fireEvent.click(menu("Barton Springs", "tripPlanner.removeFromDay"));
  expect(mocks.removeStop).toHaveBeenCalledWith(
    expect.objectContaining({ _id: "b" }),
  );
  fireEvent.click(menu("Franklin Barbecue", "tripPlanner.stopDetails"));
  expect(screen.getByText("details Franklin Barbecue")).toBeTruthy();
});

it("adds a place to the open day, by search or from a save", () => {
  const { onAddPlace } = renderBody(1);
  fireEvent.click(button("tripPlanner.addPlace"));
  expect(onAddPlace).toHaveBeenCalledWith(2);
  expect(mocks.placesArgs).toContainEqual({ tripId: "trip1" });
  fireEvent.click(
    button(
      `tripDay.addSaveToDay ${JSON.stringify({
        name: "Veracruz Tacos",
        day: `trip.dayTab ${JSON.stringify({ day: "2" })}`,
      })}`,
    ),
  );
  expect(mocks.add).toHaveBeenCalledWith(2, {
    kind: "save",
    itemId: "item1",
    name: "Veracruz Tacos",
  });
});

it("previews filling an empty day from saves for that day", () => {
  renderBody(1);
  fireEvent.click(button("tripSetup.fillDay"));
  expect(screen.getByText("preview day 2: Veracruz Tacos")).toBeTruthy();
});

it("offers no fill without the fill permission, and no saves without the saves one", () => {
  renderBody(1, { canFillFromSaves: false, canUseSaves: false });
  expect(
    screen.queryByRole("button", { name: "tripSetup.fillDay" }),
  ).toBeNull();
  expect(mocks.placesArgs.every((args) => args === "skip")).toBe(true);
});

it("shows the map for the open day and stops loading saves behind it", () => {
  renderBody(0);
  expect(screen.queryByText("map 0")).toBeNull();
  mocks.placesArgs = [];
  fireEvent.click(button("navigation.map"));
  expect(screen.getByText("map 0")).toBeTruthy();
  expect(mocks.placesArgs.at(-1)).toBe("skip");
});

it("keeps the pin tapped on the overview when its day opens", () => {
  const body = (day: number | null) => (
    <TripPlanBody
      trip={trip}
      canUseSaves
      canFillFromSaves
      day={day}
      onPickDay={vi.fn()}
      onAddPlace={vi.fn()}
    />
  );
  const { rerender } = render(body(null));
  fireEvent.click(button("navigation.map"));
  fireEvent.click(button("tap pin"));
  rerender(body(0));
  expect(screen.getByText("map focused on Barton Springs")).toBeTruthy();
});
