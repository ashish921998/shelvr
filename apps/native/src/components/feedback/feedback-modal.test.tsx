// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackModal } from "./feedback-modal";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  user: { _id: "user-1" } as { _id: string } | null,
  markSubmitted: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  openURL: vi.fn(),
}));

// The modal owns the submit path directly (the single-caller hook was
// inlined), so the mutation is mocked the way the hook's return used to be.
vi.mock("convex/react", () => ({
  useMutation: () => mocks.submit,
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.2.3", extra: { variant: "dev" } } },
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mocks.user }),
}));
// The real lib/feedback drives the invitation; only the submission mark is
// observed so a test cannot leak into another's MMKV state.
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feedback")>()),
  markFeedbackSubmitted: mocks.markSubmitted,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/posthog", () => ({
  posthog: undefined,
  isAnalyticsAvailable: () => true,
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
  }),
}));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string) => key,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: { muted: "gray", faint: "#999" } },
  }),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(() => <span data-testid="symbol" />),
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  Linking: { openURL: mocks.openURL },
  Modal: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  Platform: { OS: "ios" },
  Pressable: vi.fn(
    ({
      onPress,
      accessibilityLabel,
      children,
    }: {
      onPress: () => void;
      accessibilityLabel: string;
      children: React.ReactNode;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
  ScrollView: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  )),
  TextInput: vi.fn(
    ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (text: string) => void;
      accessibilityLabel: string;
    }) => (
      <textarea
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
  View: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
}));

function typeDraft(text: string) {
  fireEvent.change(screen.getByLabelText("feedback.messageLabel"), {
    target: { value: text },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { _id: "user-1" };
});

describe("FeedbackModal", () => {
  it("reports success only after Convex persists, then marks the invitation submitted", async () => {
    mocks.submit.mockResolvedValue({
      submissionId: "s-1",
      deliveryState: "scheduled",
    });
    render(<FeedbackModal surface="home" onClose={() => {}} />);
    typeDraft("Love the app");
    fireEvent.click(screen.getByLabelText("feedback.open"));
    await waitFor(() =>
      expect(screen.getByText("feedback.thanks")).toBeTruthy(),
    );
    expect(mocks.markSubmitted).toHaveBeenCalledWith("user-1");
    expect(mocks.submit).toHaveBeenCalledOnce();
    // Only bounded shape metadata reaches analytics — never the message.
    expect(mocks.capture).toHaveBeenCalledWith("feedback_submitted", {
      surface: "home",
      char_count: 12,
      delivery: "scheduled",
    });
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "feedback_submitted",
      expect.objectContaining({ message: expect.anything() }),
    );
  });

  it("keeps the draft on screen with the support fallback when persistence fails", async () => {
    mocks.submit.mockRejectedValue(new Error("boom"));
    render(<FeedbackModal surface="profile" onClose={() => {}} />);
    typeDraft("The thing I typed");
    fireEvent.click(screen.getByLabelText("feedback.open"));
    await waitFor(() =>
      expect(screen.getByText("feedback.sendFailedContact")).toBeTruthy(),
    );
    // The draft is preserved, editable, and re-sendable...
    expect(screen.getByLabelText("feedback.messageLabel")).toHaveProperty(
      "value",
      "The thing I typed",
    );
    // ...and Contact Support is still offered. The invitation is NOT marked.
    expect(screen.getByLabelText("support.email")).toBeTruthy();
    expect(mocks.markSubmitted).not.toHaveBeenCalled();
    // The failure reaches error tracking as the fixed, content-free Error —
    // exactly the sanitized message, never the raw reject reason ("boom").
    expect(mocks.captureError).toHaveBeenCalledWith(
      "feedback_submit_failed",
      expect.objectContaining({ message: "Feedback submission failed" }),
    );
    expect(mocks.captureError).not.toHaveBeenCalledWith(
      "feedback_submit_failed",
      expect.objectContaining({ message: expect.stringContaining("boom") }),
    );
  });

  it("does not submit twice from rapid duplicate taps", async () => {
    let resolve!: (value: {
      submissionId: string;
      deliveryState: "scheduled" | "unconfigured";
    }) => void;
    mocks.submit.mockImplementation(() => {
      return new Promise<{
        submissionId: string;
        deliveryState: "scheduled" | "unconfigured";
      }>((r) => {
        resolve = r;
      });
    });
    render(<FeedbackModal surface="home" onClose={() => {}} />);
    typeDraft("One submission");
    const send = screen.getByLabelText("feedback.open");
    fireEvent.click(send);
    fireEvent.click(send);
    await act(async () => {
      resolve({ submissionId: "s-1", deliveryState: "scheduled" });
    });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.markSubmitted).toHaveBeenCalledOnce();
  });

  it("offers the support channel instead of a form when there is no account", () => {
    mocks.user = null;
    render(<FeedbackModal surface="profile" onClose={() => {}} />);
    expect(screen.getByText("feedback.unavailableContact")).toBeTruthy();
    expect(screen.getByLabelText("support.email")).toBeTruthy();
    expect(screen.queryByLabelText("feedback.messageLabel")).toBeNull();
  });

  it("opens the support address from the fallback row", async () => {
    mocks.submit.mockRejectedValue(new Error("boom"));
    render(<FeedbackModal surface="home" onClose={() => {}} />);
    typeDraft("x");
    fireEvent.click(screen.getByLabelText("feedback.open"));
    const support = await screen.findByLabelText("support.email");
    fireEvent.click(support);
    expect(mocks.openURL).toHaveBeenCalledWith(
      "mailto:support@shelvr.app?subject=Shelvr%20Support",
    );
  });
});
