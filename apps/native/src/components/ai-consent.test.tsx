// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AiConsentCard, AiConsentSetting } from "./ai-consent";
import { beat, HERO_BEATS } from "./ai-consent-hero";

const mocks = vi.hoisted(() => ({
  status: "unset",
  answer: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  openURL: vi.fn(),
  saves: undefined as
    | {
        page: {
          type?: string;
          status: string;
          title?: string;
          url?: string;
          tags: string[];
        }[];
      }
    | undefined,
  reducedMotion: false,
  timing: vi.fn(),
  initialProgress: [] as number[],
  noIcon: () => null,
}));
vi.mock("@/lib/ai-consent", () => ({
  useAiConsent: () => ({ status: mocks.status, answer: mocks.answer }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listItemsPage: "listItemsPage" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.saves }),
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
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mocks.noIcon }));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
  Easing: { linear: "linear" },
  interpolateColor: () => "",
  useAnimatedStyle: (style: () => object) => style(),
  useReducedMotion: () => mocks.reducedMotion,
  useSharedValue: (value: number) => {
    mocks.initialProgress.push(value);
    return { value };
  },
  withTiming: mocks.timing,
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
  mocks.reducedMotion = false;
  mocks.initialProgress = [];
  mocks.saves = { page: [] };
});

it.each([
  ["aiConsent.allow", true],
  ["aiConsent.turnOff", false],
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
    "aiConsent.turnOff",
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
  await act(async () => fireEvent.click(screen.getByText("aiConsent.turnOff")));
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

it("plays the hero over one of the person's own titled saves, when there is one", () => {
  mocks.saves = {
    page: [
      { status: "processing", tags: [] },
      {
        type: "link",
        status: "ready",
        title: "Lentil soup",
        url: "https://example.com/soup",
        tags: ["dinner", "vegan"],
      },
    ],
  };
  render(<AiConsentCard />);
  expect(screen.getByText("aiConsent.example")).toBeTruthy();
  expect(screen.getByText("Lentil soup")).toBeTruthy();
  expect(screen.getByText("example.com/soup")).toBeTruthy();
  expect(screen.getByText("dinner")).toBeTruthy();
  expect(screen.queryByText("onboarding.sampleRamen")).toBeNull();
});

it("plays the hero over the built-in example for someone with nothing titled yet", () => {
  mocks.saves = { page: [{ status: "ready", tags: [] }] };
  render(<AiConsentCard />);
  expect(screen.queryByText("aiConsent.example")).toBeNull();
  expect(screen.getByText("onboarding.sampleRamen")).toBeTruthy();
  expect(screen.getByText("aiConsent.heroTagDinner")).toBeTruthy();
});

it("draws nothing in the hero's place until the person's saves have been read", () => {
  mocks.saves = undefined;
  render(<AiConsentCard />);
  expect(screen.queryByText("onboarding.sampleRamen")).toBeNull();
  expect(mocks.timing).not.toHaveBeenCalled();
});

it("starts the hero from the beginning and plays it once", () => {
  render(<AiConsentCard />);
  expect(mocks.initialProgress).toContain(0);
  expect(mocks.timing).toHaveBeenCalledTimes(1);
});

it("rests on the finished save with Reduce Motion on", () => {
  mocks.reducedMotion = true;
  render(<AiConsentCard />);
  expect(mocks.initialProgress).toContain(1);
  expect(mocks.timing).not.toHaveBeenCalled();
});

it("keeps every beat inside the hero's one run, in order", () => {
  const [scanFrom, scanTo] = HERO_BEATS.scan;
  const [revealFrom, revealTo] = HERO_BEATS.reveal;
  const [lastFrom, lastTo] = HERO_BEATS.tag(2);
  expect(0 < scanFrom && scanFrom < scanTo).toBe(true);
  expect(revealFrom < revealTo && revealTo < lastFrom).toBe(true);
  expect(lastTo).toBeLessThanOrEqual(1);
  expect(beat(0, scanFrom, scanTo)).toBe(0);
  expect(beat(1, lastFrom, lastTo)).toBe(1);
  expect(beat((scanFrom + scanTo) / 2, scanFrom, scanTo)).toBeGreaterThan(0.5);
});
