// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { MapSearch } from "./map-search";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: { query?: string }) =>
    params?.query ? `${key}:${params.query}` : key,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button aria-label={label} onClick={onPress} />
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: { muted: "#888" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
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
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
}));

it("lists matches under the field and hands back the one tapped", () => {
  const onSelect = vi.fn();
  render(
    <MapSearch
      text="ram"
      onChangeText={vi.fn()}
      total={2}
      results={[
        { id: "a", name: "Ramen Tatsu-Ya", city: "Austin" },
        { id: "b", name: "Best Ramen" },
      ]}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByText("Best Ramen"));
  expect(onSelect).toHaveBeenCalledWith("b");
  expect(screen.getByText("Austin")).toBeTruthy();
});

it("says when nothing matches, and clearing empties the field", () => {
  const onChangeText = vi.fn();
  render(
    <MapSearch
      text="sushi "
      onChangeText={onChangeText}
      total={0}
      results={[]}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText("map.searchNoResults:sushi")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("search.clear"));
  expect(onChangeText).toHaveBeenCalledWith("");
});

it("shows no list while the field is empty", () => {
  render(
    <MapSearch
      text=""
      onChangeText={vi.fn()}
      total={0}
      results={undefined}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByLabelText("search.clear")).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
});

it("says how many more places match than it lists", () => {
  render(
    <MapSearch
      text="chicago"
      onChangeText={vi.fn()}
      total={45}
      results={[{ id: "a", name: "Olio e Più", city: "Chicago" }]}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText("map.searchMore")).toBeTruthy();
});
