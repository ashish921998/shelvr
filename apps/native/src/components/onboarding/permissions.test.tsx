// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PermissionsStep } from "./permissions";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  requestPermission: vi.fn<() => Promise<boolean>>(),
  setPending: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string) => key,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: {
    capture: mocks.capture,
    captureError: mocks.captureError,
  },
}));
vi.mock("@/lib/notifications", () => ({
  requestNotificationPermission: mocks.requestPermission,
}));
vi.mock("@/lib/pending-notification-preference", () => ({
  setPendingWeeklyShelfOptIn: mocks.setPending,
}));
vi.mock("@/components/symbol", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the component export it stubs
  AppSymbolIcon: () => null,
}));
vi.mock("@/components/onboarding/parts", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the component export it stubs
  CtaButton: ({
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
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys mirror the SDK exports they stub
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys mirror the SDK exports they stub
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys mirror the SDK exports they stub
  Pressable: ({
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
}));
vi.mock("react-native-reanimated", async () => {
  const { Text, View } = await import("react-native");
  const transition = { duration: () => transition, delay: () => transition };
  return { default: { Text, View }, FadeInDown: transition };
});
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: { primaryText: "orange" } },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestPermission.mockResolvedValue(true);
});

describe("PermissionsStep", () => {
  it("requests permission and retains an accepted choice for sign-in", async () => {
    const onAdvance = vi.fn();
    render(<PermissionsStep onAdvance={onAdvance} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "permissions.enableNotifications",
      }),
    );

    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
    expect(mocks.setPending).toHaveBeenCalledWith(true);
    expect(mocks.capture).toHaveBeenCalledWith(
      "onboarding_notification_choice",
      { enabled: true },
    );
  });

  it("advances without requesting permission when the user chooses not now", () => {
    const onAdvance = vi.fn();
    render(<PermissionsStep onAdvance={onAdvance} />);

    fireEvent.click(screen.getByRole("button", { name: "common.notNow" }));

    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.setPending).toHaveBeenCalledWith(false);
    expect(mocks.capture).toHaveBeenCalledWith(
      "onboarding_notification_choice",
      { enabled: false },
    );
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("explains a denied permission and advances from the alert", async () => {
    mocks.requestPermission.mockResolvedValue(false);
    const onAdvance = vi.fn();
    render(<PermissionsStep onAdvance={onAdvance} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "permissions.enableNotifications",
      }),
    );

    await waitFor(() => expect(mocks.alert).toHaveBeenCalledOnce());
    expect(mocks.setPending).toHaveBeenCalledWith(false);
    expect(onAdvance).not.toHaveBeenCalled();
    const actions = mocks.alert.mock.calls[0][2] as { onPress: () => void }[];
    actions[0].onPress();
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("reports request failures and leaves the choice available to retry", async () => {
    const error = new Error("native prompt failed");
    mocks.requestPermission.mockRejectedValue(error);
    const onAdvance = vi.fn();
    render(<PermissionsStep onAdvance={onAdvance} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "permissions.enableNotifications",
      }),
    );

    await waitFor(() =>
      expect(mocks.captureError).toHaveBeenCalledWith(
        "notification_permission_request_failed",
        error,
      ),
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "notifications.updateFailed",
      "errors.trySoon",
    );
    expect(mocks.setPending).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
