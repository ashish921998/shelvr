// A launch that lost its Convex session must not report its first events as
// the previous account. The SDK is stubbed; each test loads a fresh module
// because the check runs at import time.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  refreshToken: null as string | null,
  distinctId: "user-1",
  anonymousId: "anon-1",
  calls: [] as string[],
}));

vi.mock("posthog-react-native", () => ({
  default: class PostHogStub {
    register = vi.fn(() => state.calls.push("register"));
    ready = vi.fn(async () => {});
    getDistinctId = () => state.distinctId;
    getAnonymousId = () => state.anonymousId;
    reset = vi.fn(() => state.calls.push("reset"));
  },
}));
vi.mock("expo-secure-store", () => ({
  getItem: vi.fn(() => state.refreshToken),
}));
vi.mock("expo-updates", () => ({
  updateId: null,
  channel: null,
  isEmbeddedLaunch: true,
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        posthogProjectToken: "phc_test",
        posthogHost: "https://test.i.posthog.com",
        variant: "development",
      },
    },
  },
}));

beforeEach(() => {
  vi.resetModules();
  state.refreshToken = null;
  state.distinctId = "user-1";
  state.anonymousId = "anon-1";
  state.calls = [];
});

async function launch() {
  const module = await import("./posthog");
  module.afterIdentitySettles(() => state.calls.push("send"));
  await vi.waitFor(() => expect(state.calls).toContain("send"));
}

describe("launch identity", () => {
  it("drops a previous account before sending when no session is stored", async () => {
    await launch();
    expect(state.calls.slice(1)).toEqual(["reset", "register", "send"]);
  });

  it("keeps the identity while a session is stored", async () => {
    state.refreshToken = "refresh";
    await launch();
    expect(state.calls).not.toContain("reset");
  });

  it("keeps an anonymous launch on its id", async () => {
    state.distinctId = "anon-1";
    await launch();
    expect(state.calls).not.toContain("reset");
  });

  it("reads the key Convex Auth writes for this deployment", async () => {
    vi.stubEnv(
      "EXPO_PUBLIC_CONVEX_URL",
      "https://happy-otter-123.convex.cloud",
    );
    const secureStore = await import("expo-secure-store");
    await launch();
    expect(secureStore.getItem).toHaveBeenCalledWith(
      "https___happy-otter-123.convex.cloud___convexAuthRefreshToken_httpshappyotter123convexcloud",
    );
    vi.unstubAllEnvs();
  });
});
