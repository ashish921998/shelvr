// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { TripDayPreview } from "@/components/trip-planner/trip-day-preview";

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/map-pin-emoji", () => ({ categoryEmoji: () => "x" }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.apply,
  useQuery: () => undefined,
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(
    ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button onClick={onPress}>{title}</button>
    ),
  ),
}));
vi.mock("react-native", () => ({
  Modal: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

const tripId = "trip-1" as Id<"tripPlans">;
const place = (name: string) => ({
  itemId: `item-${name}` as Id<"items">,
  name,
  title: `${name} reel`,
});
const places = [place("Alma"), place("Bodega"), place("Cantina")];

function renderPreview(onClose = vi.fn()) {
  render(
    <TripDayPreview
      tripId={tripId}
      day={2}
      label="Day 2"
      limit={2}
      places={places}
      onClose={onClose}
    />,
  );
  return onClose;
}

const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Fill a day from saves", () => {
  it("adds the stops kept after a swap and a skip to the chosen day", async () => {
    mocks.apply.mockResolvedValue(true);
    const onClose = renderPreview();
    expect(screen.getByText("Alma")).toBeTruthy();
    expect(
      screen.getByText(
        `tripDay.progress ${JSON.stringify({ current: "1", total: 2 })}`,
      ),
    ).toBeTruthy();

    press("trip.swap");
    expect(screen.getByText("Cantina")).toBeTruthy();
    expect(screen.queryByText("Alma")).toBeNull();
    press("tripDay.keep");
    expect(screen.getByText("Bodega")).toBeTruthy();
    press("tripDay.skip");

    expect(screen.getByText("tripDay.selectedStops")).toBeTruthy();
    expect(screen.getByText("Cantina")).toBeTruthy();
    expect(screen.queryByText("Bodega")).toBeNull();
    press("tripDay.addSelected");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.apply).toHaveBeenCalledWith({
      tripId,
      day: 2,
      places: [{ itemId: "item-Cantina", name: "Cantina" }],
    });
  });

  it("closes without saving anything", () => {
    const onClose = renderPreview();
    press("tripDay.keep");
    press("common.close");
    expect(onClose).toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("offers only Done when every stop is skipped", () => {
    const onClose = renderPreview();
    press("tripDay.skip");
    press("tripDay.skip");
    expect(screen.getByText("tripDay.noKept")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "tripDay.addSelected" }),
    ).toBeNull();
    press("common.done");
    expect(onClose).toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("keeps the sheet open when the day changed underneath it", async () => {
    mocks.apply.mockResolvedValue(false);
    const onClose = renderPreview();
    press("tripDay.keep");
    press("tripDay.keep");
    press("tripDay.addSelected");
    expect(await screen.findByText("tripDay.suggestionsChanged")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "common.done" })).toBeTruthy();
  });
});
