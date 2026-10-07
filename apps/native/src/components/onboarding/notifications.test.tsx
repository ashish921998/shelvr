// @vitest-environment jsdom
// The onboarding notifications step: skipped when there is nothing to ask,
// otherwise the OS prompt comes only from the "Turn on" tap.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsStep } from "./notifications";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  state: vi.fn(),
  request: vi.fn(),
  setWeeklyShelf: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  authenticated: true,
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  preview: ({ body }: { body: string }) => <p>{body}</p>,
  button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/lib/notification-token", () => ({
  notificationPermissionState: mock.state,
  requestNotificationPermission: mock.request,
}));
vi.mock("@/lib/notifications", () => ({
  useNotificationSession: () => ({
    session: { setWeeklyShelf: mock.setWeeklyShelf },
  }),
}));
vi.mock("@/components/notification-preview", () => ({
  NotificationPreview: mock.preview,
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mock.button,
  GhostButton: mock.button,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { getItem: "items:getItem" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.authenticated = true;
  mock.state.mockResolvedValue("ask");
  mock.request.mockResolvedValue(true);
  mock.setWeeklyShelf.mockResolvedValue(true);
});

describe("NotificationsStep", () => {
  it.each(["granted", "blocked"])(
    "moves on without showing anything when permission is %s",
    async (state) => {
      mock.state.mockResolvedValue(state);
      const onAdvance = vi.fn();
      const { container } = render(
        <NotificationsStep saved={null} onAdvance={onAdvance} />,
      );
      await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
      expect(container.innerHTML).toBe("");
      expect(mock.request).not.toHaveBeenCalled();
    },
  );

  it("asks the OS and turns on the weekly shelf only after the tap", async () => {
    const onAdvance = vi.fn();
    render(<NotificationsStep saved={null} onAdvance={onAdvance} />);
    const turnOn = await screen.findByText("onboarding.notifyAllow");
    expect(mock.request).not.toHaveBeenCalled();
    fireEvent.click(turnOn);
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).toHaveBeenCalledOnce();
    expect(mock.setWeeklyShelf).toHaveBeenCalledWith(true);
    expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
      action: "turn_on",
      granted: true,
    });
  });

  it("keeps the weekly shelf off when the OS prompt is declined", async () => {
    mock.request.mockResolvedValue(false);
    const onAdvance = vi.fn();
    render(<NotificationsStep saved={null} onAdvance={onAdvance} />);
    fireEvent.click(await screen.findByText("onboarding.notifyAllow"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.setWeeklyShelf).not.toHaveBeenCalled();
  });

  it("signed out, only asks for the permission", async () => {
    mock.authenticated = false;
    const onAdvance = vi.fn();
    render(<NotificationsStep saved={null} onAdvance={onAdvance} />);
    fireEvent.click(await screen.findByText("onboarding.notifyAllow"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.request).toHaveBeenCalledOnce();
    expect(mock.setWeeklyShelf).not.toHaveBeenCalled();
  });

  it("still moves on when saving the preference fails", async () => {
    mock.setWeeklyShelf.mockRejectedValue(new Error("offline"));
    const onAdvance = vi.fn();
    render(<NotificationsStep saved={null} onAdvance={onAdvance} />);
    fireEvent.click(await screen.findByText("onboarding.notifyAllow"));
    await waitFor(() => expect(onAdvance).toHaveBeenCalledOnce());
    expect(mock.captureError).toHaveBeenCalledWith(
      "onboarding_notifications_failed",
      expect.any(Error),
    );
  });

  it("Not now moves on without the OS prompt", async () => {
    const onAdvance = vi.fn();
    render(<NotificationsStep saved={null} onAdvance={onAdvance} />);
    fireEvent.click(await screen.findByText("common.notNow"));
    expect(onAdvance).toHaveBeenCalledOnce();
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.capture).toHaveBeenCalledWith("onboarding_notifications", {
      action: "not_now",
      granted: false,
    });
  });
});
