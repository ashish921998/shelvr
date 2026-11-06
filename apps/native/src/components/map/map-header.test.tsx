// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { MapHeader } from "./map-header";

const push = vi.fn();

vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/components/back-circle", () => ({
  BackCircle: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button aria-label={label} onClick={onPress} />
    ),
  ),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/wordmark", () => ({
  Wordmark: vi.fn(() => <span>wordmark</span>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(({ label }: { label: string }) => (
    <button aria-label={label} />
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({
    theme: { colors: { foreground: "#000", muted: "#888" } },
    rt: { insets: { top: 0 } },
  }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  TextInput: vi.fn(
    ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (text: string) => void;
      accessibilityLabel: string;
    }) => (
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

function Harness({
  city,
  canSearch = true,
  onShowAllCities,
}: {
  city?: string;
  canSearch?: boolean;
  onShowAllCities?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <MapHeader
      city={city}
      canSearch={canSearch}
      onShowAllCities={onShowAllCities}
      searchOpen={open}
      text={text}
      onChangeText={setText}
      onOpenSearch={() => setOpen(true)}
      onCancel={() => {
        setText("");
        setOpen(false);
      }}
    />
  );
}

beforeEach(() => push.mockClear());

it("titles the map with the city and opens that city's page", () => {
  render(<Harness city="Lisbon" />);
  fireEvent.click(screen.getByLabelText("Lisbon"));
  expect(push).toHaveBeenCalledWith({
    pathname: "/city/[name]",
    params: { name: "Lisbon" },
  });
});

it("shows the wordmark when no place has a city", () => {
  render(<Harness />);
  expect(screen.getByText("wordmark")).toBeTruthy();
});

it("opens the search field, and Cancel clears the text and closes it", () => {
  render(<Harness city="Lisbon" />);
  fireEvent.click(screen.getByLabelText("map.searchPlaceholder"));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "ramen" } });
  expect((input as HTMLInputElement).value).toBe("ramen");
  fireEvent.click(screen.getByLabelText("common.cancel"));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByLabelText("Lisbon")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("map.searchPlaceholder"));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

it("hides Search when there are no places but keeps Profile", () => {
  render(<Harness canSearch={false} />);
  expect(screen.queryByLabelText("map.searchPlaceholder")).toBeNull();
  fireEvent.click(screen.getByLabelText("navigation.profile"));
  expect(push).toHaveBeenCalledWith("/profile");
});

it("offers the way back to every city only beside a city title, and not while searching", () => {
  const showAll = vi.fn();
  const { rerender } = render(<Harness onShowAllCities={showAll} />);
  expect(screen.queryByLabelText("map.showAllCities")).toBeNull();
  rerender(<Harness city="Lisbon" onShowAllCities={showAll} />);
  fireEvent.click(screen.getByLabelText("map.showAllCities"));
  expect(showAll).toHaveBeenCalledTimes(1);
  rerender(<Harness city="Lisbon" />);
  expect(screen.queryByLabelText("map.showAllCities")).toBeNull();
  rerender(<Harness city="Lisbon" onShowAllCities={showAll} />);
  fireEvent.click(screen.getByLabelText("map.searchPlaceholder"));
  expect(screen.queryByLabelText("map.showAllCities")).toBeNull();
});
