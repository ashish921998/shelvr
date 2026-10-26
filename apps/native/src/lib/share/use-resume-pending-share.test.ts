// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useResumePendingShare } from "./use-resume-pending-share";

const mock = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false },
  onboarded: true,
  pathname: "/",
  replace: vi.fn(),
  hasPendingShare: false,
  hasResumablePayloads: false,
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
vi.mock("@/lib/share/resumable-payloads", () => ({
  hasResumableSharedPayloads: () => mock.hasResumablePayloads,
}));

beforeEach(() => {
  mock.auth = { isAuthenticated: true, isLoading: false };
  mock.onboarded = true;
  mock.pathname = "/";
  mock.replace.mockReset();
  mock.hasPendingShare = false;
  mock.hasResumablePayloads = false;
});

function renderResume() {
  return renderHook(() => useResumePendingShare());
}

describe("useResumePendingShare", () => {
  it("holds an owed share behind the plan gate and resumes it once a plan lifts the gate", () => {
    mock.hasPendingShare = true;
    let blocked = true;
    const { rerender } = renderHook(() => useResumePendingShare(blocked));
    expect(mock.replace).not.toHaveBeenCalled();

    blocked = false;
    rerender();
    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("recovers a share whose launch URL was lost, once auth restores", () => {
    mock.auth = { isAuthenticated: false, isLoading: true };
    mock.hasResumablePayloads = true;
    const { rerender } = renderResume();

    expect(mock.replace).not.toHaveBeenCalled();

    mock.auth = { isAuthenticated: true, isLoading: false };
    rerender();

    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("resumes a share deferred by the pending flag", () => {
    mock.hasPendingShare = true;
    renderResume();

    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("waits for onboarding and sign-in before recovering either signal", () => {
    mock.onboarded = false;
    mock.hasResumablePayloads = true;
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

  it("stays home over the leftover of an explicitly discarded share", () => {
    const { rerender } = renderResume();
    expect(mock.replace).not.toHaveBeenCalled();

    mock.hasResumablePayloads = true;
    rerender();
    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("stays on home when nothing is owed, and recovers a later share", () => {
    const { rerender } = renderResume();
    expect(mock.replace).not.toHaveBeenCalled();

    mock.hasResumablePayloads = true;
    rerender();
    expect(mock.replace).toHaveBeenCalledWith("/share");
  });

  it("navigates only once per recovered share", () => {
    mock.hasResumablePayloads = true;
    const { rerender } = renderResume();
    expect(mock.replace).toHaveBeenCalledTimes(1);

    rerender();
    expect(mock.replace).toHaveBeenCalledTimes(1);

    mock.pathname = "/share";
    rerender();
    expect(mock.replace).toHaveBeenCalledTimes(1);
  });

  it("leaves the share screen alone when the launch URL already routed it", () => {
    mock.pathname = "/share";
    mock.hasResumablePayloads = true;
    renderResume();

    expect(mock.replace).not.toHaveBeenCalled();
  });
});
