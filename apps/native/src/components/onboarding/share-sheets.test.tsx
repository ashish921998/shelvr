// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AppsSheet } from "./share-sheets";

type Children = { children?: ReactNode };

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/motion", () => ({ sheetIn: () => undefined }));
vi.mock("@/lib/color", () => ({ withAlpha: (color: string) => color }));
vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn() }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: Children) => <div>{children}</div>),
  Text: vi.fn(({ children }: Children) => <span>{children}</span>),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: vi.fn(({ children }: Children) => <div>{children}</div>) },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/onboarding/parts", () => ({
  ScalePressable: vi.fn(
    ({
      children,
      accessibilityLabel,
      disabled,
      onPress,
    }: Children & {
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => (
      <button
        type="button"
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

afterEach(cleanup);

const enabled = () =>
  screen
    .getAllByRole("button")
    .filter((button) => !(button as HTMLButtonElement).disabled)
    .map((button) => button.getAttribute("aria-label") ?? button.textContent);

/** The section Shelvr's row sits under: the nearest section title before it. */
const shelvrSection = () => {
  const text = document.body.textContent ?? "";
  const at = text.indexOf("Shelvr", text.indexOf("aha.sheetApps"));
  return text.lastIndexOf("aha.sheetFavorites", at) >
    text.lastIndexOf("aha.sheetSuggestions", at)
    ? "favorites"
    : "suggestions";
};

it("walks Edit, the plus, Done, then Shelvr, one live target at a time", () => {
  const onPick = vi.fn();
  render(<AppsSheet onPick={onPick} />);

  expect(screen.getByText("aha.coachEdit")).toBeTruthy();
  expect(enabled()).toEqual(["aha.sheetEdit"]);
  expect(shelvrSection()).toBe("suggestions");
  fireEvent.click(screen.getByText("aha.sheetEdit"));

  expect(screen.getByText("aha.coachAdd")).toBeTruthy();
  expect(enabled()).toEqual(["aha.pinShelvr"]);
  fireEvent.click(screen.getByLabelText("aha.pinShelvr"));

  expect(screen.getByText("aha.coachDone")).toBeTruthy();
  expect(enabled()).toEqual(["aha.sheetDone"]);
  expect(shelvrSection()).toBe("favorites");
  fireEvent.click(screen.getByText("aha.sheetDone"));

  expect(screen.getByText("aha.coachShelvr")).toBeTruthy();
  expect(enabled()).toEqual(["Shelvr"]);
  expect(shelvrSection()).toBe("favorites");
  expect(onPick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Shelvr"));
  expect(onPick).toHaveBeenCalledOnce();
});
