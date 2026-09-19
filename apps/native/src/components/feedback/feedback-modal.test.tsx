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
  openURL: vi.fn(),
}));

vi.mock("@/lib/use-submit-feedback", () => ({
  useSubmitFeedback: () => mocks.submit,
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
  analytics: { capture: mocks.capture },
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
    mocks.submit.mockResolvedValue("accepted");
    render(<FeedbackModal surface="home" onClose={() => {}} />);
    typeDraft("Love the app");
    fireEvent.click(screen.getByLabelText("feedback.open"));
    await waitFor(() =>
      expect(screen.getByText("feedback.thanks")).toBeTruthy(),
    );
    expect(mocks.markSubmitted).toHaveBeenCalledWith("user-1");
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("keeps the draft on screen with the support fallback when persistence fails", async () => {
    mocks.submit.mockResolvedValue("failed");
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
  });

  it("does not submit twice from rapid duplicate taps", async () => {
    let resolve!: (value: "accepted" | "failed") => void;
    mocks.submit.mockImplementation(
      () =>
        new Promise<"accepted" | "failed">((r) => {
          resolve = r;
        }),
    );
    render(<FeedbackModal surface="home" onClose={() => {}} />);
    typeDraft("One submission");
    const send = screen.getByLabelText("feedback.open");
    fireEvent.click(send);
    fireEvent.click(send);
    await act(async () => {
      resolve("accepted");
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
    mocks.submit.mockResolvedValue("failed");
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
