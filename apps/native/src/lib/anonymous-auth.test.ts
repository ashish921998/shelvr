import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnonymousAuthEnabled } from "./anonymous-auth";

const constantsMock = vi.hoisted(() => ({
  constants: { expoConfig: { extra: { variant: "development" as unknown } } },
}));
vi.mock("expo-constants", () => ({ default: constantsMock.constants }));

function setVariant(variant: unknown): void {
  constantsMock.constants.expoConfig = { extra: { variant } };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAnonymousAuthEnabled", () => {
  it("returns false when the flag is unset", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "");
    setVariant("development");
    expect(isAnonymousAuthEnabled()).toBe(false);
  });

  it('returns false when the flag is not "true" even on development', () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "false");
    setVariant("development");
    expect(isAnonymousAuthEnabled()).toBe(false);
  });

  it("returns true with the flag on a development build", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "true");
    setVariant("development");
    expect(isAnonymousAuthEnabled()).toBe(true);
  });

  it("returns false with the flag on a preview build", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "true");
    setVariant("preview");
    expect(isAnonymousAuthEnabled()).toBe(false);
  });

  it("returns false with the flag on a production build", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "true");
    setVariant("production");
    expect(isAnonymousAuthEnabled()).toBe(false);
  });

  it("fails closed when expoConfig is missing", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS", "true");
    constantsMock.constants.expoConfig = undefined as never;
    expect(isAnonymousAuthEnabled()).toBe(false);
  });
});
