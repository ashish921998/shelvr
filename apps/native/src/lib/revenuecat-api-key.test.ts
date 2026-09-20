import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constantsMock = vi.hoisted(() => ({
  constants: { expoConfig: { extra: { variant: "development" as unknown } } },
  platform: { OS: "ios" as "ios" | "android" | "web" },
}));
vi.mock("react-native", () => ({ Platform: constantsMock.platform }));
vi.mock("expo-constants", () => ({ default: constantsMock.constants }));

function setVariant(variant: unknown): void {
  constantsMock.constants.expoConfig = { extra: { variant } };
}

async function loadKey(
  platform: "ios" | "android" | "web",
): Promise<string | undefined> {
  constantsMock.platform.OS = platform;
  vi.resetModules();
  const module = await import("./revenuecat-api-key");
  return module.REVENUECAT_API_KEY;
}

beforeEach(() => {
  vi.resetModules();
  setVariant("development");
  constantsMock.platform.OS = "ios";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("REVENUECAT_API_KEY", () => {
  it("uses the platform production key on production builds", async () => {
    setVariant("production");
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "appl_prod");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_ANDROID_KEY", "goog_prod");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBe("appl_prod");
    await expect(loadKey("android")).resolves.toBe("goog_prod");
  });

  it("prefers the production key even in a debug runtime", async () => {
    setVariant("production");
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "appl_prod");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBe("appl_prod");
  });

  it("uses the test key on non-production debug builds", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBe("test_dev");
    await expect(loadKey("android")).resolves.toBe("test_dev");
  });

  it("configures nothing on a release-mode development build", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBeUndefined();
    await expect(loadKey("android")).resolves.toBeUndefined();
  });

  it("configures nothing on a preview build (release configuration)", async () => {
    setVariant("preview");
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBeUndefined();
  });

  it("fails closed when expoConfig is missing on a release build", async () => {
    constantsMock.constants.expoConfig = undefined as never;
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", "test_dev");
    await expect(loadKey("ios")).resolves.toBeUndefined();
  });

  it("does not configure RevenueCat on web", async () => {
    setVariant("production");
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "appl_prod");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_ANDROID_KEY", "goog_prod");
    await expect(loadKey("web")).resolves.toBeUndefined();
  });
});
