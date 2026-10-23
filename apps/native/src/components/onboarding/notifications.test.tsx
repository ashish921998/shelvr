// @vitest-environment jsdom
// The notifications step: a lock screen dressed for the person's goal, one
// button that asks iOS, and "Not now". Allowing on a places goal queues the
// weekly shelf it promises.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { samplePlan } from "@/lib/sample-trip";
import { NotificationsStep } from "./notifications";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
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
  }) => (
    <button type="button" onClick={onPress} disabled={busy || disabled}>
      {label}
    </button>
  ),
  request: vi.fn<() => Promise<boolean>>(),
  queueWeeklyShelf: vi.fn(),
  applyQueuedWeeklyShelf: vi.fn(async () => {}),
  setWeeklyShelf: vi.fn(),
  authenticated: false,
  capture: vi.fn(),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: { title?: string }) =>
    values?.title === undefined ? key : `${key} ${values.title}`,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mock.button,
  GhostButton: mock.button,
}));
vi.mock("@/lib/notification-token", () => ({
  requestNotificationPermission: mock.request,
}));
vi.mock("@/lib/pending-weekly-shelf", () => ({
  queueWeeklyShelf: mock.queueWeeklyShelf,
  applyQueuedWeeklyShelf: mock.applyQueuedWeeklyShelf,
}));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    session: { setWeeklyShelf: mock.setWeeklyShelf },
  }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));

const barcelona = samplePlan("trip", "barcelona");

beforeEach(() => {
  mock.request.mockReset();
  mock.queueWeeklyShelf.mockReset();
  mock.applyQueuedWeeklyShelf.mockReset().mockResolvedValue(undefined);
  mock.authenticated = false;
  mock.capture.mockReset();
});

describe("NotificationsStep", () => {
  it("names a stop from their trip in the weekly shelf on a places goal", () => {
    render(
      <NotificationsStep
        goal="travel"
        trip={barcelona}
        leaving={false}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.getByText("onboardingNotify.travelTitle", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText("weekly.previewTitle")).toBeTruthy();
    expect(
      screen.getByText("weekly.previewBody Catedral de Barcelona"),
    ).toBeTruthy();
  });

  it("shows the recipe reminder for recipes, and no weekly shelf", () => {
    render(
      <NotificationsStep
        goal="recipes"
        trip={barcelona}
        leaving={false}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText("reminder.cookTitle")).toBeTruthy();
    expect(
      screen.getByText("reminder.cookBody Easy classic lasagne"),
    ).toBeTruthy();
    expect(screen.queryByText("weekly.previewTitle")).toBeNull();
  });

  it("falls back to the general screen when no goal was picked", () => {
    render(
      <NotificationsStep
        goal={null}
        trip={barcelona}
        leaving={false}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText("reminder.readTitle")).toBeTruthy();
  });

  it("asks iOS, queues the shelf it promised, and moves on", async () => {
    mock.request.mockResolvedValue(true);
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="food"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("onboardingNotify.allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(mock.queueWeeklyShelf).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
      action: "allow",
      granted: true,
    });
  });

  it("asks iOS once however fast the button is tapped twice", async () => {
    let answer: (granted: boolean) => void = () => {};
    mock.request.mockReturnValue(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="travel"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    const allow = screen.getByText("onboardingNotify.allow");
    fireEvent.click(allow);
    fireEvent.click(allow);
    answer(true);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("turns the shelf on right away for someone already signed in", async () => {
    mock.authenticated = true;
    mock.request.mockResolvedValue(true);
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="date"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("onboardingNotify.allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.queueWeeklyShelf).toHaveBeenCalledTimes(1);
    expect(mock.applyQueuedWeeklyShelf).toHaveBeenCalledTimes(1);
  });

  it("leaves the queued shelf to sign-in when signed out", async () => {
    mock.request.mockResolvedValue(true);
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="travel"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("onboardingNotify.allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.queueWeeklyShelf).toHaveBeenCalledTimes(1);
    expect(mock.applyQueuedWeeklyShelf).not.toHaveBeenCalled();
  });

  it("does not queue a shelf it never promised", async () => {
    mock.request.mockResolvedValue(true);
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="recipes"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("onboardingNotify.allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.queueWeeklyShelf).not.toHaveBeenCalled();
  });

  it("moves on without queueing when iOS says no", async () => {
    mock.request.mockResolvedValue(false);
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="travel"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("onboardingNotify.allow"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mock.queueWeeklyShelf).not.toHaveBeenCalled();
  });

  it("moves on without asking on Not now, and again after a closed paywall", () => {
    const onDone = vi.fn();
    render(
      <NotificationsStep
        goal="travel"
        trip={barcelona}
        leaving={false}
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByText("common.notNow"));
    fireEvent.click(screen.getByText("common.notNow"));
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
      action: "skip",
      granted: false,
    });
  });
});
