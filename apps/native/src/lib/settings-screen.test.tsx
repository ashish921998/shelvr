// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SettingsScreen from "@/app/(app)/settings";

type AlertButton = { text: string; style?: string; onPress?: () => void };

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  restorePurchases: vi.fn(),
  deleteAccount: vi.fn(),
  setWeeklyShelf: vi.fn(),
  setSaveReminders: vi.fn(),
  preferences: { weeklyShelfEnabled: true, remindersEnabled: true } as
    | { weeklyShelfEnabled: boolean; remindersEnabled: boolean }
    | undefined,
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => false,
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: null }),
}));
vi.mock("@/lib/entitlement", () => ({
  restorePurchases: mocks.restorePurchases,
}));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    operation: "idle",
    session: {
      deleteAccount: mocks.deleteAccount,
      setWeeklyShelf: mocks.setWeeklyShelf,
      setSaveReminders: mocks.setSaveReminders,
    },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.preferences }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: vi.fn(), canGoBack: () => true, replace: vi.fn() }),
}));
// The screen's own flows are under test; its child settings have their own.
vi.mock("@/components/legal-consent", () => ({
  LegalConsentPreference: vi.fn(() => null),
}));
vi.mock("@/components/update-setting", () => ({
  UpdateSetting: vi.fn(() => null),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
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
  Alert: { alert: mocks.alert },
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
    }: {
      children: ReactNode;
      onPress?: () => void;
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
      onValueChange,
    }: {
      accessibilityLabel: string;
      value: boolean;
      onValueChange: (value: boolean) => void;
    }) => (
      <input
        type="checkbox"
        aria-label={accessibilityLabel}
        checked={value}
        onChange={() => onValueChange(!value)}
      />
    ),
  ),
}));

function lastAlert() {
  const call = mocks.alert.mock.calls.at(-1);
  if (!call) throw new Error("no alert shown");
  return {
    title: call[0] as string,
    message: call[1] as string | undefined,
    buttons: (call[2] ?? []) as AlertButton[],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences = { weeklyShelfEnabled: true, remindersEnabled: true };
});
afterEach(cleanup);

it("deletes the account only after the destructive confirm", async () => {
  mocks.deleteAccount.mockResolvedValue(undefined);
  render(<SettingsScreen />);
  fireEvent.click(screen.getByText("account.delete"));

  const confirm = lastAlert();
  expect(confirm.title).toBe("account.deleteTitle");
  expect(mocks.deleteAccount).not.toHaveBeenCalled();

  confirm.buttons.find((button) => button.style === "cancel")?.onPress?.();
  expect(mocks.deleteAccount).not.toHaveBeenCalled();

  await act(async () => {
    confirm.buttons
      .find((button) => button.style === "destructive")
      ?.onPress?.();
  });
  expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
});

it("reports a failed deletion and points to support", async () => {
  mocks.deleteAccount.mockRejectedValue(new Error("server"));
  render(<SettingsScreen />);
  fireEvent.click(screen.getByText("account.delete"));
  await act(async () => {
    lastAlert()
      .buttons.find((button) => button.style === "destructive")
      ?.onPress?.();
  });
  expect(mocks.captureError).toHaveBeenCalledWith(
    "account_deletion_failed",
    expect.any(Error),
  );
  expect(lastAlert().title).toBe("account.deleteFailed");
  expect(lastAlert().message).toBe("errors.contactSupport");
});

it.each([
  ["restored", "pro.restoredTitle"],
  ["none", "pro.notFoundTitle"],
  ["failed", "pro.restoreFailed"],
] as const)("maps a %s restore to its own alert", async (outcome, title) => {
  mocks.restorePurchases.mockResolvedValue(outcome);
  render(<SettingsScreen />);
  await act(async () => fireEvent.click(screen.getByText("pro.restore")));
  expect(mocks.restorePurchases).toHaveBeenCalledTimes(1);
  expect(lastAlert().title).toBe(title);
});

it("records turning the weekly shelf off as a decision", async () => {
  mocks.setWeeklyShelf.mockResolvedValue(true);
  render(<SettingsScreen />);
  await act(async () =>
    fireEvent.click(screen.getByLabelText("notifications.toggleLabel")),
  );
  expect(mocks.setWeeklyShelf).toHaveBeenCalledWith(false);
  expect(mocks.capture).toHaveBeenCalledWith("notification_disabled", {
    notification_kind: "weekly_shelf",
  });
});

it("sends a blocked reminder toggle to system settings", async () => {
  mocks.preferences = { weeklyShelfEnabled: false, remindersEnabled: false };
  mocks.setSaveReminders.mockResolvedValue(false);
  render(<SettingsScreen />);
  await act(async () =>
    fireEvent.click(screen.getByLabelText("notifications.remindersToggle")),
  );
  expect(mocks.setSaveReminders).toHaveBeenCalledWith(true);
  expect(lastAlert().title).toBe("notifications.disabledTitle");
  expect(mocks.capture).not.toHaveBeenCalled();
});

it("leaves a toggle unrecorded when another operation held the queue", async () => {
  mocks.setWeeklyShelf.mockResolvedValue(undefined);
  render(<SettingsScreen />);
  await act(async () =>
    fireEvent.click(screen.getByLabelText("notifications.toggleLabel")),
  );
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.alert).not.toHaveBeenCalled();
});
