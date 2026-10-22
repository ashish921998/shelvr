import { beforeEach, describe, expect, it, vi } from "vitest";

import { startFreshForE2E } from "./e2e-fresh-install";

const mock = vi.hoisted(() => ({
  os: "ios",
  argument: undefined as unknown,
  devSignIn: true,
  resets: {
    forgetStoredSession: vi.fn(),
    forgetOnboarded: vi.fn(),
    clearPending: vi.fn(),
    clearPurchaseBeforeSignIn: vi.fn(),
    clearQueued: vi.fn(),
    clearPendingShareOnDevice: vi.fn(),
    clearShareDiscardedOnDevice: vi.fn(),
    clearSharedPayloads: vi.fn(),
  },
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
vi.mock("expo-sharing", () => ({
  clearSharedPayloads: mock.resets.clearSharedPayloads,
}));
vi.mock("@/lib/auth-storage", () => ({
  forgetStoredSession: mock.resets.forgetStoredSession,
}));
vi.mock("@/lib/onboarding", () => ({
  forgetOnboarded: mock.resets.forgetOnboarded,
}));
vi.mock("@/lib/pending-onboarding", () => ({
  clearPending: mock.resets.clearPending,
}));
vi.mock("@/lib/purchase-before-sign-in", () => ({
  clearPurchaseBeforeSignIn: mock.resets.clearPurchaseBeforeSignIn,
}));
vi.mock("@/lib/queued-first-save", () => ({
  clearQueued: mock.resets.clearQueued,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  clearPendingShareOnDevice: mock.resets.clearPendingShareOnDevice,
  clearShareDiscardedOnDevice: mock.resets.clearShareDiscardedOnDevice,
}));

describe("startFreshForE2E", () => {
  beforeEach(() => {
    mock.os = "ios";
    mock.argument = "YES";
    mock.devSignIn = true;
    vi.clearAllMocks();
  });

  const called = () =>
    Object.values(mock.resets).filter((reset) => reset.mock.calls.length > 0)
      .length;

  it("runs every reset on a development build launched with the argument", () => {
    startFreshForE2E();
    expect(called()).toBe(Object.keys(mock.resets).length);
  });

  it("does nothing without the argument", () => {
    for (const value of [undefined, null, "NO", "", 1, true]) {
      mock.argument = value;
      startFreshForE2E();
    }
    expect(called()).toBe(0);
  });

  it("does nothing on a build without dev sign-in, whatever it is launched with", () => {
    mock.devSignIn = false;
    startFreshForE2E();
    expect(called()).toBe(0);
  });

  it("does nothing off iOS", () => {
    mock.os = "android";
    startFreshForE2E();
    expect(called()).toBe(0);
  });
});
