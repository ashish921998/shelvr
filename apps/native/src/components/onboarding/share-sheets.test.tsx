// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AppsSheet } from "./share-sheets";
import { AhaShareStep } from "./aha-share";
import { AhaReel } from "./aha-reel";
import { ahaSample } from "@/lib/aha-sample";
import { haptics } from "@/lib/haptics";

type Children = { children?: ReactNode };

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/motion", () => ({ sheetIn: () => undefined, fadeIn: {} }));
vi.mock("@/lib/color", () => ({ withAlpha: (color: string) => color }));
vi.mock("@/components/onboarding/reel-video", () => ({
  ReelVideo: vi.fn(() => null),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("react-native", () => ({
  View: vi.fn(
    ({
      children,
      accessibilityRole,
      accessibilityLabel,
    }: Children & {
      accessibilityRole?: string;
      accessibilityLabel?: string;
    }) => (
      <div role={accessibilityRole} aria-label={accessibilityLabel}>
        {children}
      </div>
    ),
  ),
  ScrollView: vi.fn(({ children }: Children) => <div>{children}</div>),
  ActivityIndicator: vi.fn(() => null),
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
  QuestionTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
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

it("offers Shelvr immediately after More, without a pinning interaction", () => {
  const onPick = vi.fn();
  render(<AppsSheet onPick={onPick} />);
  expect(screen.getByText("aha.coachShelvr")).toBeTruthy();
  expect(enabled()).toEqual(["Shelvr"]);
  expect(screen.queryByText("aha.sheetEdit")).toBeNull();
  expect(screen.queryByLabelText("aha.pinShelvr")).toBeNull();
  expect(screen.queryByText("aha.sheetDone")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Shelvr" }));
  expect(onPick).toHaveBeenCalledOnce();
});

it.each(["date", "trip", "weekend"] as const)(
  "shows a saveable %s reel with matching map data when the selected city has no reel",
  (kind) => {
    const sample = ahaSample(kind, "lisbon");
    render(<AhaReel sample={sample} onShare={vi.fn()} />);
    const image = screen.getByRole("image");
    expect(image.getAttribute("aria-label")).toBe("aha.sampleBadge");
    expect(sample.firstSaveUrl).toContain(sample.videoCode);
    expect(sample.spots.map((spot) => spot.name)).toEqual(
      sample.trip.days[0].stops.map((stop) => stop.name),
    );
  },
);

it("gives the Shelvr pick the medium impact, the only one in the practice share", () => {
  const impact = vi.spyOn(haptics, "impact");
  render(
    <AhaShareStep sample={ahaSample("trip", "lisbon")} onShared={vi.fn()} />,
  );
  for (const label of ["common.share", "aha.sheetShareTo", "aha.sheetMore"]) {
    fireEvent.click(screen.getByRole("button", { name: label }));
  }
  expect(impact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Shelvr" }));
  expect(impact.mock.calls).toEqual([["medium"]]);
  impact.mockRestore();
});

it("reaches the map callback after only Share, Share to…, More and Shelvr", () => {
  vi.useFakeTimers();
  try {
    const onShared = vi.fn();
    render(
      <AhaShareStep sample={ahaSample("trip", "lisbon")} onShared={onShared} />,
    );
    for (const label of [
      "common.share",
      "aha.sheetShareTo",
      "aha.sheetMore",
      "Shelvr",
    ]) {
      expect(enabled()).toEqual([label]);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onShared).not.toHaveBeenCalled();
    }
    expect(screen.getByText("aha.reading")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1200));
    expect(onShared).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(5000));
    expect(onShared).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
