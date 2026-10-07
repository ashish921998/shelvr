// @vitest-environment jsdom
// The onboarding reminder step: skipped when there is nothing to remind about
// or no way to notify, otherwise the OS prompt comes only from the tap.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoSaved } from "./live-demo";
import { NotificationsStep } from "./notifications";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  state: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  item: undefined as unknown,
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pressable: ({ children, onPress }: Children & { onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
  button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
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
    theme: { colors: { primaryText: "#000" }, opacity: { pressed: 0.7 } },
  }),
}));
vi.mock("expo-image", () => ({ Image: mock.empty }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.empty }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/lib/notification-token", () => ({
  notificationPermissionState: mock.state,
  requestNotificationPermission: mock.request,
}));
vi.mock("expo-notifications", () => ({}));
vi.mock("@/lib/first-save-reminder", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  scheduleFirstSaveReminder: mock.schedule,
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mock.button,
  GhostButton: mock.button,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { getItem: "getItem" } },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: unknown, args: unknown) => ({ fn, args }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mock.item }),
}));

const saved = { itemId: "item-1", savedSpaceNames: [] } as unknown as DemoSaved;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // A Wednesday afternoon, so the first option is tonight.
  vi.setSystemTime(new Date(2026, 9, 7, 14, 0));
  mock.state.mockResolvedValue("ask");
  mock.request.mockResolvedValue(true);
  mock.schedule.mockResolvedValue(undefined);
  mock.item = {
    title: "Lemon pasta",
    url: "https://www.bonappetit.com/recipe",
    tags: ["cook"],
  };
});

const renderStep = (step: DemoSaved | null = saved) => {
  const onAdvance = vi.fn();
  render(<NotificationsStep saved={step} onAdvance={onAdvance} />);
  return onAdvance;
};

describe("NotificationsStep", () => {
  it("shows the save and the times to pick from", () => {
    renderStep();
    expect(screen.getByText("Lemon pasta")).toBeTruthy();
    expect(
      screen.getByText("bonappetit.com · onboarding.remindSavedNow"),
    ).toBeTruthy();
    expect(screen.getByText("onboarding.remindTonight")).toBeTruthy();
    expect(screen.getByText("onboarding.remindWeekend")).toBeTruthy();
    expect(screen.getByText("onboarding.remindNextWeek")).toBeTruthy();
  });

  it("moves on by itself when there is no save", async () => {
    const onAdvance = renderStep(null);
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("moves on by itself when notifications are refused for good", async () => {
    mock.state.mockResolvedValue("blocked");
    const onAdvance = renderStep();
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("stays when permission is already granted", async () => {
    mock.state.mockResolvedValue("granted");
    const onAdvance = renderStep();
    await waitFor(() => expect(mock.state).toHaveBeenCalled());
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it("asks the OS and schedules the picked time only after the tap", async () => {
    const onAdvance = renderStep();
    fireEvent.click(screen.getByText("onboarding.remindWeekend"));
    expect(mock.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("onboarding.remindCtaWeekend"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).toHaveBeenCalledOnce();
    expect(mock.schedule).toHaveBeenCalledWith({
      itemId: "item-1",
      title: "Lemon pasta",
      at: new Date(2026, 9, 10, 10, 0),
    });
    expect(mock.capture).toHaveBeenCalledWith("onboarding_reminder", {
      action: "remind",
      slot: "weekend",
      granted: true,
    });
  });

  it("shows fresh times instead of scheduling one that has passed", async () => {
    const onAdvance = renderStep();
    // Left open until after 8 pm, so "tonight" has gone.
    vi.setSystemTime(new Date(2026, 9, 7, 21, 0));
    fireEvent.click(screen.getByText("onboarding.remindCtaTonight"));
    expect(mock.request).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("onboarding.remindCtaTomorrow"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ at: new Date(2026, 9, 8, 20, 0) }),
    );
  });

  it("asks once when the button is tapped twice", async () => {
    const onAdvance = renderStep();
    const remind = screen.getByText("onboarding.remindCtaTonight");
    fireEvent.click(remind);
    fireEvent.click(remind);
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).toHaveBeenCalledOnce();
  });

  it("schedules nothing when the OS prompt is declined", async () => {
    mock.request.mockResolvedValue(false);
    const onAdvance = renderStep();
    fireEvent.click(screen.getByText("onboarding.remindCtaTonight"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("still moves on and reports when scheduling fails", async () => {
    mock.schedule.mockRejectedValue(new Error("no"));
    const onAdvance = renderStep();
    fireEvent.click(screen.getByText("onboarding.remindCtaTonight"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.captureError).toHaveBeenCalledWith(
      "onboarding_reminder_failed",
      expect.any(Error),
    );
  });

  it("names the save by its site while the title is not ready", async () => {
    mock.item = { title: "", url: "https://example.com/a", tags: [] };
    const onAdvance = renderStep();
    fireEvent.click(screen.getByText("onboarding.remindCtaTonight"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ title: "example.com" }),
    );
  });

  it("Don't remind me moves on without the OS prompt", () => {
    const onAdvance = renderStep();
    fireEvent.click(screen.getByText("onboarding.remindSkip"));
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.capture).toHaveBeenCalledWith("onboarding_reminder", {
      action: "skip",
      slot: "tonight",
      granted: false,
    });
  });
});
