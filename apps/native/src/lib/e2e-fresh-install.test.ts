import { beforeEach, describe, expect, it, vi } from "vitest";

import { startFreshForE2E } from "./e2e-fresh-install";

const mock = vi.hoisted(() => ({
  os: "ios",
  argument: undefined as unknown,
  devSignIn: true,
  forgetStoredSession: vi.fn(),
  forgetOnboarded: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
  Settings: {
    get: () => mock.argument,
  },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => mock.devSignIn,
}));
vi.mock("@/lib/auth-storage", () => ({
  forgetStoredSession: mock.forgetStoredSession,
}));
vi.mock("@/lib/onboarding", () => ({ forgetOnboarded: mock.forgetOnboarded }));
vi.mock("@/lib/pending-onboarding", () => ({ clearPending: vi.fn() }));
vi.mock("@/lib/purchase-before-sign-in", () => ({
  clearPurchaseBeforeSignIn: vi.fn(),
}));
vi.mock("@/lib/queued-first-save", () => ({ clearQueued: vi.fn() }));
vi.mock("expo-sharing", () => ({ clearSharedPayloads: vi.fn() }));
vi.mock("@/lib/share/pending-share-store", () => ({
  clearPendingShareOnDevice: vi.fn(),
  clearShareDiscardedOnDevice: vi.fn(),
}));

describe("startFreshForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
    mock.devSignIn = true;
    vi.clearAllMocks();
  });

  const signedOut = () =>
    mock.forgetStoredSession.mock.calls.length > 0 &&
    mock.forgetOnboarded.mock.calls.length > 0;

  it("signs out and forgets onboarding on a development build launched with the argument", () => {
    startFreshForE2E();
    expect(signedOut()).toBe(true);
  });

  it("does nothing without the argument", () => {
    for (const value of [undefined, null, "NO", "", 1, true]) {
      mock.argument = value;
      startFreshForE2E();
    }
    expect(mock.forgetStoredSession).not.toHaveBeenCalled();
  });

  it("does nothing on a build without dev sign-in, whatever it is launched with", () => {
    mock.devSignIn = false;
    startFreshForE2E();
    expect(mock.forgetStoredSession).not.toHaveBeenCalled();
  });

  it("does nothing off iOS", () => {
    mock.os = "android";
    startFreshForE2E();
    expect(mock.forgetStoredSession).not.toHaveBeenCalled();
  });
});
