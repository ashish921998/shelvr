// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useResumePendingShare } from "./use-resume-pending-share";

const mock = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false },
  onboarded: true,
  pathname: "/",
  replace: vi.fn(),
  markDirectLaunch: vi.fn(),
  hasPendingShare: false,
  hasUnreadPayloads: false,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mock.auth,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mock.replace }),
  usePathname: () => mock.pathname,
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mock.onboarded }),
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  hasPendingShareOnDevice: () => mock.hasPendingShare,
}));
vi.mock("@/lib/share/unread-payloads", () => ({
  hasUnreadSharedPayloads: () => mock.hasUnreadPayloads,
}));
vi.mock("@/lib/splash/launch-intent", () => ({
  markDirectLaunch: mock.markDirectLaunch,
}));

beforeEach(() => {
  mock.auth = { isAuthenticated: true, isLoading: false };
  mock.onboarded = true;
  mock.pathname = "/";
  mock.replace.mockReset();
  mock.markDirectLaunch.mockReset();
  mock.hasPendingShare = false;
  mock.hasUnreadPayloads = false;
});

function renderResume() {
  return renderHook(() => useResumePendingShare());
}

describe("useResumePendingShare", () => {
  it("recovers a share whose launch URL was lost, once auth restores", () => {
    // The regression: an Android cold start from the share sheet whose
    // `shelvr://expo-sharing` URL lost Expo Router's initial-URL race. The
    // launch landed on Home, no deferred flag was set, and the payloads are
    // the only record that a share is owed.
    mock.auth = { isAuthenticated: false, isLoading: true };
    mock.hasUnreadPayloads = true;
    const { rerender } = renderResume();

    // Auth still restoring: nothing routes yet.
    expect(mock.replace).not.toHaveBeenCalled();

    mock.auth = { isAuthenticated: true, isLoading: false };
    rerender();

    expect(mock.replace).toHaveBeenCalledWith("/share");
    expect(mock.markDirectLaunch).toHaveBeenCalledTimes(1);
  });

  it("resumes a share deferred by the pending flag", () => {
    mock.hasPendingShare = true;
    renderResume();

    expect(mock.replace).toHaveBeenCalledWith("/share");
    expect(mock.markDirectLaunch).toHaveBeenCalledTimes(1);
  });

  it("waits for onboarding and sign-in before recovering either signal", () => {
    mock.onboarded = false;
    mock.hasUnreadPayloads = true;
    const { rerender } = renderResume();
    expect(mock.replace).not.toHaveBeenCalled();

    mock.onboarded = true;
    mock.auth = { isAuthenticated: false, isLoading: false };
    rerender();
    expect(mock.replace).not.toHaveBeenCalled();

    mock.auth = { isAuthenticated: true, isLoading: false };
    rerender();
    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("stays on home when nothing is owed, and recovers a later share", () => {
    const { rerender } = renderResume();
    expect(mock.replace).not.toHaveBeenCalled();

    // A share arrives later in the same session (the warm onNewIntent path
    // routed it; this hook stays out of the way). Nothing left unread, the
    // guard resets, so the NEXT recovered share still routes.
    mock.hasUnreadPayloads = true;
    rerender();
    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("navigates only once per recovered share", () => {
    mock.hasUnreadPayloads = true;
    const { rerender } = renderResume();
    expect(mock.replace).toHaveBeenCalledTimes(1);

    // Re-renders before the pathname lands on /share must not re-navigate.
    rerender();
    expect(mock.replace).toHaveBeenCalledTimes(1);

    mock.pathname = "/share";
    rerender();
    expect(mock.replace).toHaveBeenCalledTimes(1);
  });

  it("leaves the share screen alone when the launch URL already routed it", () => {
    mock.pathname = "/share";
    mock.hasUnreadPayloads = true;
    renderResume();

    expect(mock.replace).not.toHaveBeenCalled();
    expect(mock.markDirectLaunch).not.toHaveBeenCalled();
  });
});
