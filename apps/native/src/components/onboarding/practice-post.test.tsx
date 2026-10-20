// @vitest-environment jsdom
// The share practice's pretend post: the card opens the sheet, and a disabled
// card does not.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEMO_SAMPLES } from "@/lib/onboarding-demo";
import { PracticePost, ShareSteps } from "./practice-post";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pressable: ({
    children,
    onPress,
    disabled,
  }: Children & { onPress: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
  empty: () => null,
}));

vi.mock("react-native", () => ({
  View: mock.view,
  Text: mock.text,
  Pressable: mock.pressable,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: {}, opacity: { pressed: 0.7, disabled: 0.4 } },
  }),
}));
vi.mock("expo-image", () => ({ Image: mock.empty }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.empty }));
vi.mock("@/components/onboarding/sample-card", () => ({
  sampleImage: () => 0,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));

const sample = DEMO_SAMPLES[1];

describe("practice post", () => {
  it("opens the sheet from the card", () => {
    const onPress = vi.fn();
    render(<PracticePost sample={sample} disabled={false} onPress={onPress} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("takes no taps while the step is leaving", () => {
    const onPress = vi.fn();
    render(<PracticePost sample={sample} disabled onPress={onPress} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("lists both taps in order", () => {
    render(<ShareSteps active={1} />);
    expect(screen.getByText("sharePractice.stepShare")).toBeTruthy();
    expect(screen.getByText("sharePractice.stepShelvr")).toBeTruthy();
  });
});
