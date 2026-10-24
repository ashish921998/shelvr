// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AiConsentSetting } from "./ai-consent";

const mocks = vi.hoisted(() => ({
  status: "unset",
  answer: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ status: mocks.status, answer: mocks.answer }),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/components/ui/setting-card", () => ({
  SettingCard: vi.fn(({ accessory }: { accessory: ReactNode }) => (
    <div>{accessory}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Switch: vi.fn(
    ({
      accessibilityLabel,
      value,
      disabled,
      onValueChange,
    }: {
      accessibilityLabel: string;
      value: boolean;
      disabled?: boolean;
      onValueChange: (value: boolean) => void;
    }) => (
      <input
        type="checkbox"
        aria-label={accessibilityLabel}
        checked={value}
        disabled={disabled}
        onChange={() => onValueChange(!value)}
      />
    ),
  ),
}));

const toggle = () =>
  screen.getByLabelText("aiConsent.setting") as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = "unset";
  mocks.answer.mockResolvedValue(undefined);
});

it.each([
  ["unset", true],
  ["granted", true],
  ["declined", false],
] as const)("shows AI as on for %s: %s", (status, on) => {
  mocks.status = status;
  render(<AiConsentSetting />);
  expect(toggle().checked).toBe(on);
});

it("shows the new value while it saves, and the recorded one if that fails", async () => {
  mocks.status = "granted";
  let fail: (error: Error) => void = () => {};
  mocks.answer.mockReturnValue(
    new Promise((_resolve, reject) => {
      fail = reject;
    }),
  );
  render(<AiConsentSetting />);
  fireEvent.click(toggle());
  expect(toggle().checked).toBe(false);
  expect(toggle().disabled).toBe(true);
  expect(mocks.answer).toHaveBeenCalledWith(false);
  await act(async () => fail(new Error("offline")));
  expect(toggle().checked).toBe(true);
  expect(mocks.captureError).toHaveBeenCalled();
});
