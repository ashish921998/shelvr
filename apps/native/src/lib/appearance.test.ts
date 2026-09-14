import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  isAppearanceMode,
  isDarkThemeName,
  readStoredAppearanceMode,
  resolveThemeName,
  sanitizeAppearanceMode,
  writeStoredAppearanceMode,
} from "./appearance";

// In-memory MMKV so the storage boundary is exercised without a native runtime.
const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => kv.get(key),
    set: (key: string, value: string) => void kv.set(key, value),
  }),
}));

beforeEach(() => {
  kv.clear();
});

describe("sanitizeAppearanceMode", () => {
  it("falls back to system for corrupt or foreign values", () => {
    expect(sanitizeAppearanceMode(undefined)).toBe("system");
    expect(sanitizeAppearanceMode("neon")).toBe("system");
    expect(sanitizeAppearanceMode(42)).toBe("system");
    expect(sanitizeAppearanceMode(null)).toBe("system");
  });

  it("accepts every advertised mode", () => {
    for (const mode of APPEARANCE_MODES) {
      expect(sanitizeAppearanceMode(mode)).toBe(mode);
      expect(isAppearanceMode(mode)).toBe(true);
    }
  });

  it("labels every mode for the profile control", () => {
    for (const mode of APPEARANCE_MODES) {
      expect(APPEARANCE_LABELS[mode]).toBeTruthy();
    }
    expect(APPEARANCE_LABELS.system).toBe("appearance.system");
    expect(APPEARANCE_LABELS.light).toBe("appearance.light");
    expect(APPEARANCE_LABELS.darkWarm).toBe("appearance.warmDark");
    expect(APPEARANCE_LABELS.darkNeutral).toBe("appearance.neutralDark");
  });
});

describe("resolveThemeName", () => {
  it("maps pinned modes to their theme regardless of the OS scheme", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(resolveThemeName("light", scheme)).toBe("light");
      expect(resolveThemeName("darkWarm", scheme)).toBe("dark");
      expect(resolveThemeName("darkNeutral", scheme)).toBe("darkNeutral");
    }
  });

  it("follows the OS scheme only for system", () => {
    expect(resolveThemeName("system", "dark")).toBe("dark");
    expect(resolveThemeName("system", "light")).toBe("light");
  });
});

describe("isDarkThemeName", () => {
  it("treats both dark palettes as dark", () => {
    expect(isDarkThemeName("dark")).toBe(true);
    expect(isDarkThemeName("darkNeutral")).toBe(true);
    expect(isDarkThemeName("light")).toBe(false);
    expect(isDarkThemeName(undefined)).toBe(false);
  });
});

describe("stored appearance preference", () => {
  it("defaults to system and round-trips a written mode", () => {
    expect(readStoredAppearanceMode()).toBe("system");
    writeStoredAppearanceMode("darkNeutral");
    expect(readStoredAppearanceMode()).toBe("darkNeutral");
    writeStoredAppearanceMode("darkWarm");
    expect(readStoredAppearanceMode()).toBe("darkWarm");
  });

  it("treats a corrupt stored value as system", () => {
    kv.set("appearance.mode", "brown-est");
    expect(readStoredAppearanceMode()).toBe("system");
  });
});
