// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MapPageSaveAll } from "./map-page-save-all";

type SwitchProps = {
  testID?: string;
  accessibilityLabel?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
};

const mocks = vi.hoisted(() => ({
  saveAll: {
    ready: true,
    on: false,
    busy: false,
    toggle: vi.fn(),
  },
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/creator-map", () => ({
  useSaveAllSwitch: () => mocks.saveAll,
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    theme: { colors: { border: "border", primary: "primary" } },
  }),
}));
vi.mock("react-native", () => ({
  Switch: vi.fn(
    ({
      testID,
      accessibilityLabel,
      value,
      disabled,
      onValueChange,
    }: SwitchProps) => (
      <input
        type="checkbox"
        data-testid={testID}
        aria-label={accessibilityLabel}
        checked={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.checked)}
      />
    ),
  ),
}));
vi.mock("@/components/ui/setting-card", () => ({
  SettingCard: vi.fn(
    ({
      title,
      description,
      accessory,
    }: {
      title: string;
      description?: string;
      accessory?: ReactNode;
    }) => (
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {accessory}
      </div>
    ),
  ),
}));

function toggle() {
  return screen.getByTestId("map-page-save-all") as HTMLInputElement;
}

beforeEach(() => {
  mocks.saveAll = { ready: true, on: false, busy: false, toggle: vi.fn() };
});
afterEach(() => cleanup());

it("shows the switch with its title and what it does", () => {
  render(<MapPageSaveAll />);
  expect(screen.getByText("creatorMaps.switchTitle")).toBeTruthy();
  expect(screen.getByText("creatorMaps.switchBody")).toBeTruthy();
  expect(toggle().getAttribute("aria-label")).toBe("creatorMaps.switchTitle");
  expect(toggle().checked).toBe(false);
  expect(toggle().disabled).toBe(false);
});

it("reflects Save all being on", () => {
  mocks.saveAll.on = true;
  render(<MapPageSaveAll />);
  expect(toggle().checked).toBe(true);
});

it("holds the switch while busy", () => {
  mocks.saveAll.busy = true;
  render(<MapPageSaveAll />);
  expect(toggle().disabled).toBe(true);
});

it("passes a flip to the toggle", () => {
  render(<MapPageSaveAll />);
  fireEvent.click(toggle());
  expect(mocks.saveAll.toggle).toHaveBeenCalledWith(true);
});

it("renders nothing until the page is ready", () => {
  mocks.saveAll.ready = false;
  const { container } = render(<MapPageSaveAll />);
  expect(container.innerHTML).toBe("");
});
