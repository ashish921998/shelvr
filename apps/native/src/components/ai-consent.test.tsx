// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AiConsentCard, AiConsentSetting } from "./ai-consent";

const mocks = vi.hoisted(() => ({
  status: "unset",
  answer: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  openURL: vi.fn(),
  noIcon: () => null,
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ status: mocks.status, answer: mocks.answer }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      onPress,
      loading,
    }: {
      title: string;
      onPress: () => void;
      loading?: boolean;
    }) => (
      <button onClick={onPress} disabled={loading}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/onboarding/parts", () => ({
  GhostButton: vi.fn(
    ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button onClick={onPress} disabled={disabled}>
        {label}
      </button>
    ),
  ),
}));
vi.mock("@/lib/aha-sample", () => ({
  ahaSample: () => ({
    city: "austin",
    creator: "@365thingsaustin",
    spots: [
      { name: "Eberly" },
      { name: "The Guest House" },
      { name: "Jupiter Supper Club" },
    ],
  }),
}));
vi.mock("@/lib/sample-cities", () => ({
  SAMPLE_CITIES: { austin: { name: "tripTeaser.cityAustin" } },
}));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  PinBadge: mocks.noIcon,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Linking: { openURL: mocks.openURL },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
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
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
  ),
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
  ["aiConsent.allow", true],
  ["aiConsent.notNow", false],
] as const)("records %s as granted: %s", async (label, granted) => {
  render(<AiConsentCard />);
  expect(mocks.capture).toHaveBeenCalledWith("ai_consent_shown");
  const button = screen.getByText(label).closest("button");
  expect(button?.disabled).toBe(false);
  await act(async () => fireEvent.click(screen.getByText(label)));
  expect(mocks.answer.mock.calls).toEqual([[granted, "card"]]);
});

it("offers nothing but the two choices and the privacy link", () => {
  render(<AiConsentCard />);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "legal.privacy",
    "aiConsent.allow",
    "aiConsent.notNow",
  ]);
  fireEvent.click(screen.getByText("legal.privacy"));
  expect(mocks.openURL).toHaveBeenCalledWith(
    "https://shelvr-web.vercel.app/privacy",
  );
  expect(mocks.answer).not.toHaveBeenCalled();
});

it("says so when the answer could not be saved, and lets the user retry", async () => {
  mocks.answer.mockRejectedValue(new Error("private error"));
  render(<AiConsentCard />);
  await act(async () => fireEvent.click(screen.getByText("aiConsent.notNow")));
  expect(screen.getByText("refundConsent.error")).toBeDefined();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "ai_consent_save_failed",
    expect.objectContaining({ message: "ai_consent_save_failed" }),
  );
  expect(screen.getByText("aiConsent.allow").closest("button")?.disabled).toBe(
    false,
  );
});

it.each([
  ["unset", false],
  ["declined", false],
  ["granted", true],
] as const)("shows %s as switched on: %s, and flips it", async (status, on) => {
  mocks.status = status;
  render(<AiConsentSetting />);
  expect(toggle().checked).toBe(on);
  await act(async () => fireEvent.click(toggle()));
  expect(mocks.answer.mock.calls).toEqual([[!on, "settings"]]);
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
  await act(async () => fail(new Error("offline")));
  expect(toggle().checked).toBe(true);
  expect(mocks.captureError).toHaveBeenCalled();
});

it("shows onboarding's example and the places Shelvr found in it", () => {
  render(<AiConsentCard />);
  expect(screen.getByText("aha.fromReel")).toBeDefined();
  expect(
    ["Eberly", "The Guest House", "Jupiter Supper Club"].map(
      (name) => screen.getByText(name) !== null,
    ),
  ).toEqual([true, true, true]);
});
