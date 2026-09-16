// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { WeeklyNudgeSheet } from "./weekly-nudge-sheet";

const mock = vi.hoisted(() => ({
  setWeeklyShelf: vi.fn(),
  finish: vi.fn(),
  alert: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/first-share", () => ({
  finishWeeklyNudge: mock.finish,
  isWeeklyNudgePending: () => true,
}));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    session: { setWeeklyShelf: mock.setWeeklyShelf },
  }),
}));
vi.mock("@/components/notification-preview", () => ({
  NotificationPreview: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: vi.fn(
    ({
      label,
      onPress,
      busy,
    }: {
      label: string;
      onPress: () => void;
      busy: boolean;
    }) => (
      <button disabled={busy} onClick={onPress}>
        {label}
      </button>
    ),
  ),
  GhostButton: vi.fn(
    ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled: boolean;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
  ),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { notifications: { getPreferences: "preferences" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { weeklyShelfEnabled: false } }),
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mock.alert },
  Linking: { openSettings: mock.settings },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Modal: vi.fn(
    ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? <div>{children}</div> : null,
  ),
  Pressable: vi.fn(() => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.setWeeklyShelf.mockReset().mockResolvedValue(true);
});

it("keeps the opt-in pending after denied permission and lets the user finish after Settings", async () => {
  mock.setWeeklyShelf.mockResolvedValueOnce(false);
  render(<WeeklyNudgeSheet userId="user-a" />);
  fireEvent.click(screen.getByText("weekly.remindMe"));
  await waitFor(() => expect(mock.alert).toHaveBeenCalledTimes(1));
  expect(mock.finish).not.toHaveBeenCalled();
  expect(screen.getByText("weekly.remindMe")).toBeDefined();
  const buttons = mock.alert.mock.calls[0][2] as {
    text: string;
    onPress: () => void;
  }[];
  buttons
    .find((button) => button.text === "permissions.openSettings")
    ?.onPress();
  expect(mock.settings).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("weekly.remindMe"));
  await waitFor(() => expect(mock.finish).toHaveBeenCalledWith("user-a"));
  expect(screen.queryByText("weekly.remindMe")).toBeNull();
});

it("does not consume the opt-in while another session operation is busy", async () => {
  mock.setWeeklyShelf.mockResolvedValueOnce(undefined);
  render(<WeeklyNudgeSheet userId="user-a" />);
  fireEvent.click(screen.getByText("weekly.remindMe"));
  await waitFor(() => expect(mock.setWeeklyShelf).toHaveBeenCalledTimes(1));
  expect(mock.finish).not.toHaveBeenCalled();
  expect(mock.alert).not.toHaveBeenCalled();
});

it("keeps a failed preference save retryable", async () => {
  mock.setWeeklyShelf.mockRejectedValueOnce(new Error("offline"));
  render(<WeeklyNudgeSheet userId="user-a" />);
  fireEvent.click(screen.getByText("weekly.remindMe"));
  await waitFor(() =>
    expect(mock.alert).toHaveBeenCalledWith(
      "notifications.updateFailed",
      "errors.trySoon",
    ),
  );
  expect(mock.finish).not.toHaveBeenCalled();
});
