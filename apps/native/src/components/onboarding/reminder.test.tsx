// @vitest-environment jsdom
// Allowing the trial reminder asks for notifications and keeps the lead; the
// weekly shelf stays a separate opt-in, so this step never turns it on.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ReminderStep } from "./reminder";

const mock = vi.hoisted(() => ({
  request: vi.fn(async () => true),
  setLead: vi.fn(),
  queueWeeklyShelf: vi.fn(),
  setWeeklyShelf: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/notification-token", () => ({
  requestNotificationPermission: mock.request,
}));
vi.mock("@/lib/pending-weekly-shelf", () => ({
  queueWeeklyShelf: mock.queueWeeklyShelf,
  applyQueuedWeeklyShelf: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    session: { setWeeklyShelf: mock.setWeeklyShelf },
  }),
}));
vi.mock("@/lib/trial-reminder-lead", () => ({
  TRIAL_REMINDER_LEAD_DAYS: [1, 2, 3],
  setTrialReminderLeadDays: mock.setLead,
  trialReminderLeadDays: () => 2,
}));
vi.mock("@/components/notification-preview", () => ({
  NotificationPreview: vi.fn(() => null),
}));
vi.mock("@/components/onboarding/city-pictures", () => ({
  CITY_PICTURES: { lisbon: { view: 1 } },
}));
vi.mock("@/components/onboarding/parts", () => {
  const Button = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => <button onClick={onPress}>{label}</button>;
  return {
    PillButton: Button,
    GhostButton: Button,
    QuestionTitle: vi.fn(() => null),
    ScalePressable: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  };
});
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFill: {} },
}));
vi.mock("react-native", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { View: Box, ScrollView: Box, Text: Box };
});

it("keeps the lead and leaves the weekly shelf alone", async () => {
  const onDone = vi.fn();
  render(<ReminderStep city="lisbon" leaving={false} onDone={onDone} />);
  fireEvent.click(screen.getByRole("button", { name: "common.continue" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(mock.request).toHaveBeenCalledTimes(1);
  expect(mock.setLead).toHaveBeenCalledWith(2);
  expect(mock.queueWeeklyShelf).not.toHaveBeenCalled();
  expect(mock.setWeeklyShelf).not.toHaveBeenCalled();
});
