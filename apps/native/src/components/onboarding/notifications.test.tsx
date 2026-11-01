// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AhaSample } from "@/lib/aha-sample";
import { NotificationsStep } from "./notifications";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => {
  const presses: Record<string, () => void> = {};
  return {
    presses,
    view: ({ children }: Children) => <div>{children}</div>,
    text: ({ children }: Children) => <span>{children}</span>,
    button: ({
      label,
      onPress,
      busy,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      busy?: boolean;
      disabled?: boolean;
    }) => {
      presses[label] = onPress;
      return (
        <button type="button" onClick={onPress} disabled={busy || disabled}>
          {label}
        </button>
      );
    },
    preview: ({
      title,
      body,
      when,
    }: {
      title: string;
      body: string;
      when: string;
    }) => (
      <div>
        <span>{when}</span>
        <span>{title}</span>
        <span>{body}</span>
      </div>
    ),
    request: vi.fn<() => Promise<boolean>>(),
    capture: vi.fn(),
    captureError: vi.fn(),
  };
});

vi.mock("react-native", () => ({
  ScrollView: mock.view,
  Text: mock.text,
  View: mock.view,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${JSON.stringify(values)}`,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/sample-cities", () => ({
  SAMPLE_CITIES: { austin: { name: "city.austin" } },
}));
vi.mock("@/components/onboarding/parts", () => ({
  GhostButton: mock.button,
  PillButton: mock.button,
}));
vi.mock("@/components/notification-preview", () => ({
  NotificationPreview: mock.preview,
}));
vi.mock("@/lib/notification-token", () => ({
  requestNotificationPermission: mock.request,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));

const sample = {
  city: "austin",
  spots: [{ name: "Eberly" }, { name: "Jo's" }, { name: "Barton Springs" }],
} as unknown as AhaSample;

function renderStep(leaving = false) {
  const onContinue = vi.fn();
  render(
    <NotificationsStep
      sample={sample}
      leaving={leaving}
      onContinue={onContinue}
    />,
  );
  return onContinue;
}

beforeEach(() => {
  mock.request.mockReset();
  mock.capture.mockReset();
  mock.captureError.mockReset();
});
afterEach(cleanup);

it("previews the pushes the app really sends, from the sample they just saw", () => {
  renderStep();
  expect(
    screen.getByText('reminder.tripEveTitle {"city":"city.austin"}'),
  ).toBeTruthy();
  expect(screen.getByText('reminder.tripEveBody {"count":3}')).toBeTruthy();
  expect(screen.getByText("6:00 PM")).toBeTruthy();
  expect(
    screen.getByText('reminder.visitBody {"title":"Eberly"}'),
  ).toBeTruthy();
});

it("asks iOS only after the button, then moves on with the answer", async () => {
  mock.request.mockResolvedValue(true);
  const onContinue = renderStep();
  expect(mock.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("onboardingNotify.allow"));
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  expect(mock.request).toHaveBeenCalledTimes(1);
  expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
    action: "allow",
    granted: true,
  });
});

it("moves on when they decline the iPhone prompt", async () => {
  mock.request.mockResolvedValue(false);
  const onContinue = renderStep();
  fireEvent.click(screen.getByText("onboardingNotify.allow"));
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
    action: "allow",
    granted: false,
  });
});

it("still moves on when asking fails, so nobody is stuck before the paywall", async () => {
  mock.request.mockRejectedValue(new Error("no"));
  const onContinue = renderStep();
  fireEvent.click(screen.getByText("onboardingNotify.allow"));
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  expect(mock.captureError).toHaveBeenCalledTimes(1);
});

it("asks once on a double tap", async () => {
  let answer: (granted: boolean) => void = () => undefined;
  mock.request.mockImplementation(
    () => new Promise((resolve) => (answer = resolve)),
  );
  const onContinue = renderStep();
  act(() => {
    mock.presses["onboardingNotify.allow"]?.();
    mock.presses["onboardingNotify.allow"]?.();
  });
  answer(true);
  await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  expect(mock.request).toHaveBeenCalledTimes(1);
});

it("drops the answer when Back left the screen while iOS was asking", async () => {
  let answer: (granted: boolean) => void = () => undefined;
  mock.request.mockImplementation(
    () => new Promise((resolve) => (answer = resolve)),
  );
  const onContinue = vi.fn();
  const { unmount } = render(
    <NotificationsStep
      sample={sample}
      leaving={false}
      onContinue={onContinue}
    />,
  );
  fireEvent.click(screen.getByText("onboardingNotify.allow"));
  unmount();
  await act(async () => answer(true));
  expect(onContinue).not.toHaveBeenCalled();
  expect(mock.capture).not.toHaveBeenCalled();
});

it("does not ask iOS on Not now", () => {
  const onContinue = renderStep();
  fireEvent.click(screen.getByText("common.notNow"));
  expect(mock.request).not.toHaveBeenCalled();
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
    action: "skip",
    granted: false,
  });
});

it("holds both buttons while the paywall opens", () => {
  renderStep(true);
  expect(screen.getByText("onboardingNotify.allow")).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByText("common.notNow")).toHaveProperty("disabled", true);
});
