// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { MapCitySheet } from "./map-city-sheet";

const mock = vi.hoisted(() => ({
  push: vi.fn(),
}));

type Pressed = {
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

const { box } = vi.hoisted(() => ({
  box: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/city/city-sheet", () => ({
  CitySheet: vi.fn(
    ({
      header,
      list,
    }: {
      header: ReactNode;
      list: (scroll: object) => ReactNode;
    }) => (
      <div>
        {header}
        {list({})}
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/date", () => ({
  formatRecentDate: (time: number) => `day ${time}`,
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("react-native", () => ({
  ScrollView: box,
  View: box,
  Pressable: vi.fn(
    ({ children, onPress, accessibilityLabel, disabled }: Pressed) => (
      <button
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {typeof children === "function"
          ? children({ pressed: false })
          : children}
      </button>
    ),
  ),
}));
vi.mock("react-native-reanimated", () => ({
  default: { ScrollView: box, View: box },
  interpolate: () => 1,
  useAnimatedStyle: () => ({}),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFill: {} },
}));

const save = (id: string, time: number, places = 2) => ({
  _id: id,
  _creationTime: time,
  url: `https://www.instagram.com/reel/${id}/`,
  title: `Reel ${id}`,
  imageUrl: `https://cdn.example/${id}.jpg`,
  placePins: Array.from({ length: places }, (_, index) => ({
    name: `${id}${index}`,
    lat: 40.7,
    lng: -74,
  })),
});

function sheet() {
  return render(
    <MapCitySheet
      city="New York"
      saves={[save("old", 1), save("new", 2, 0)]}
      places={14}
      snaps={{ expanded: 0, middle: 400, collapsed: 700 } as never}
      top={{ get: () => 400 } as never}
      bottomInset={0}
      onHeaderHeight={vi.fn()}
    />,
  );
}

beforeEach(() => {
  mock.push.mockClear();
});

it("names the city with its real save and place counts", () => {
  sheet();
  expect(screen.getByText("New York")).toBeTruthy();
  expect(screen.getByText("2 saves · 14 places")).toBeTruthy();
});

it("leaves Go out to the tab bar", () => {
  sheet();
  expect(screen.queryByRole("button", { name: "Go out" })).toBeNull();
});

it("opens a recent save from its cover", () => {
  sheet();
  fireEvent.click(screen.getByRole("button", { name: "Reel old, day 1" }));
  expect(mock.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "old" },
  });
});

it("lists recent saves newest first with their dates", () => {
  sheet();
  const dated = screen
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"))
    .filter((label) => label?.includes(", day "));
  expect(dated).toEqual(["Reel new, day 2", "Reel old, day 1"]);
});

it("shows no save cards and no See all row", () => {
  sheet();
  expect(screen.queryByRole("button", { name: "See all" })).toBeNull();
  expect(screen.queryByText("Saved here")).toBeNull();
});
