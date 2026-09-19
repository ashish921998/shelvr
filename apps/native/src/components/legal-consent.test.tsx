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
import { getFunctionName } from "convex/server";
import { LegalConsentBoundary, LegalConsentPreference } from "./legal-consent";
import { TERMS_VERSION } from "@convex/model/legalConsent";

type Consent =
  | { reviewedVersion: string; refundSharing: boolean; syncPending: boolean }
  | null
  | undefined;
const mocks = vi.hoisted(() => ({
  authenticated: true,
  onboarded: true,
  platform: "ios",
  consent: null as Consent,
  review: vi.fn(),
  withdraw: vi.fn(),
  captureError: vi.fn(),
  openURL: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
  useQuery: () => mocks.consent,
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === "legalConsent:review"
      ? mocks.review
      : mocks.withdraw,
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mocks.onboarded }),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>loading</div>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.platform;
    },
  },
  Linking: { openURL: mocks.openURL },
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
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.onboarded = true;
  mocks.platform = "ios";
  mocks.consent = null;
  mocks.review.mockResolvedValue(null);
  mocks.withdraw.mockResolvedValue(null);
});
afterEach(cleanup);
function boundary() {
  return (
    <LegalConsentBoundary>
      <div>library</div>
    </LegalConsentBoundary>
  );
}

it.each(["signed_out", "onboarding", "android"])(
  "does not interrupt %s",
  (state) => {
    mocks.authenticated = state !== "signed_out";
    mocks.onboarded = state !== "onboarding";
    mocks.platform = state === "android" ? "android" : "ios";
    render(boundary());
    expect(screen.getByText("library")).toBeDefined();
    expect(mocks.review).not.toHaveBeenCalled();
  },
);
it("waits for consent state before mounting purchase-capable screens", () => {
  mocks.consent = undefined;
  render(boundary());
  expect(screen.getByText("loading")).toBeDefined();
  expect(screen.queryByText("library")).toBeNull();
});
it.each([true, false])(
  "records an explicit choice %s and allows the app after either decision",
  async (accepted) => {
    const { rerender } = render(boundary());
    expect(mocks.review).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByText(
          accepted ? "refundConsent.accept" : "refundConsent.later",
        ),
      ),
    );
    expect(mocks.review).toHaveBeenCalledWith({
      version: TERMS_VERSION,
      accepted,
    });
    mocks.consent = {
      reviewedVersion: TERMS_VERSION,
      refundSharing: accepted,
      syncPending: true,
    };
    rerender(boundary());
    expect(screen.getByText("library")).toBeDefined();
  },
);
it("keeps the review available when saving fails without manufacturing consent", async () => {
  mocks.review.mockRejectedValue(new Error("private error"));
  render(boundary());
  await act(async () =>
    fireEvent.click(screen.getByText("refundConsent.accept")),
  );
  expect(screen.getByText("refundConsent.error")).toBeDefined();
  expect(screen.queryByText("library")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "legal_consent_save_failed",
    expect.objectContaining({ message: "legal_consent_save_failed" }),
  );
});
it("asks again for a new version, never silently upgrading old acceptance", () => {
  mocks.consent = {
    reviewedVersion: "old",
    refundSharing: true,
    syncPending: false,
  };
  render(boundary());
  expect(screen.getByText("refundConsent.disclosure")).toBeDefined();
  expect(mocks.review).not.toHaveBeenCalled();
});
it("offers withdrawal and displays pending remote propagation", async () => {
  mocks.consent = {
    reviewedVersion: TERMS_VERSION,
    refundSharing: true,
    syncPending: false,
  };
  const { rerender } = render(<LegalConsentPreference />);
  await act(async () =>
    fireEvent.click(screen.getByText("refundConsent.withdraw")),
  );
  expect(mocks.withdraw).toHaveBeenCalledWith({});
  mocks.consent = {
    reviewedVersion: TERMS_VERSION,
    refundSharing: false,
    syncPending: true,
  };
  rerender(<LegalConsentPreference />);
  expect(screen.getByText("refundConsent.disabled")).toBeDefined();
  expect(screen.getByText("refundConsent.syncPending")).toBeDefined();
});
it("allows an existing user to review and opt in later", async () => {
  mocks.consent = {
    reviewedVersion: TERMS_VERSION,
    refundSharing: false,
    syncPending: false,
  };
  render(<LegalConsentPreference />);
  fireEvent.click(screen.getByText("refundConsent.review"));
  expect(mocks.review).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(screen.getByText("refundConsent.accept")),
  );
  expect(mocks.review).toHaveBeenCalledWith({
    version: TERMS_VERSION,
    accepted: true,
  });
});
