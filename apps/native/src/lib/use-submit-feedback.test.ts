// Tests for the Convex-backed feedback submission hook. The hook is
// useCallback-shaped, so the slot-indexed React stand-in drives it without
// a renderer (see src/test/react-stand-in.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmitFeedback } from "./use-submit-feedback";
import { reactStandIn as react } from "../test/react-stand-in";

vi.mock("react", async () => {
  const { reactStandIn } = await import("../test/react-stand-in");
  return reactStandIn;
});

const mock = vi.hoisted(() => ({
  submit: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  submitted: vi.fn(),
  platform: "ios",
  variant: "preview" as string | undefined,
  version: "1.2.3" as string | undefined,
}));
vi.mock("convex/react", () => ({ useMutation: () => mock.submit }));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return {
        version: mock.version,
        extra: { variant: mock.variant },
      };
    },
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.platform;
    },
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));
vi.mock("@/lib/posthog", () => ({
  posthog: undefined,
  isAnalyticsAvailable: () => true,
}));
// Keep the real sanitizer; only observe the bounded capture call.
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feedback")>()),
  feedbackAnalytics: { submitted: mock.submitted },
}));
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
  }),
}));

const accepted = (deliveryState: "scheduled" | "unconfigured" = "scheduled") =>
  mock.submit.mockResolvedValue({
    submissionId: "k123",
    deliveryState,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mock.platform = "ios";
  mock.variant = "preview";
  mock.version = "1.2.3";
  accepted();
});

afterEach(() => {
  react.unmount();
});

function mount(surface: "home" | "profile" = "home") {
  return react.mount(() => useSubmitFeedback(surface));
}

describe("useSubmitFeedback", () => {
  it("persists through Convex and reports accepted with bounded context", async () => {
    const submit = mount("home");
    const result = await submit("  Love the app  ");
    expect(result).toBe("accepted");
    expect(mock.submit).toHaveBeenCalledWith({
      message: "Love the app",
      surface: "home",
      platform: "ios",
      appVersion: "1.2.3",
      buildVariant: "preview",
    });
    // The capture fires only after persistence, with bounded metadata only.
    expect(mock.submitted).toHaveBeenCalledWith("home", 12, "scheduled");
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("still reports accepted when the inbox is not yet configured", async () => {
    accepted("unconfigured");
    const submit = mount("profile");
    const result = await submit("A note");
    expect(result).toBe("accepted");
    expect(mock.submitted).toHaveBeenCalledWith("profile", 6, "unconfigured");
  });

  it("reports failed and captures the error without claiming a submission", async () => {
    mock.submit.mockRejectedValue(new Error("network down"));
    const submit = mount("home");
    const result = await submit("Love the app");
    expect(result).toBe("failed");
    // The raw Convex error (and its stack) never crosses into PostHog —
    // only the stable event name and a fixed, content-free error shape.
    expect(mock.captureError).toHaveBeenCalledWith(
      "feedback_submit_failed",
      new Error("Feedback submission failed"),
    );
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("rejects an empty message without spending a mutation", async () => {
    const submit = mount("home");
    expect(await submit("   ")).toBe("failed");
    expect(mock.submit).not.toHaveBeenCalled();
    expect(mock.submitted).not.toHaveBeenCalled();
  });

  it("omits context fields rather than sending guesses", async () => {
    mock.platform = "web";
    mock.variant = undefined;
    mock.version = undefined;
    const submit = mount("home");
    await submit("hi");
    expect(mock.submit).toHaveBeenCalledWith({
      message: "hi",
      surface: "home",
    });
  });
});
