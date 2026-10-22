import type { TextMessageKey } from "@/locales/message-types";
import { createMMKV } from "react-native-mmkv";

export const APPEARANCE_MODES = [
  "system",
  "light",
  "darkWarm",
  "darkNeutral",
] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const APPEARANCE_LABELS: Record<AppearanceMode, TextMessageKey> = {
  system: "appearance.system",
  light: "appearance.light",
  darkWarm: "appearance.warmDark",
  darkNeutral: "appearance.neutralDark",
};

export type AppThemeName = "light" | "dark" | "darkNeutral";

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return (
    typeof value === "string" &&
    (APPEARANCE_MODES as readonly string[]).includes(value)
  );
}

export function sanitizeAppearanceMode(value: unknown): AppearanceMode {
  return isAppearanceMode(value) ? value : "system";
}

export function resolveThemeName(
  mode: AppearanceMode,
  colorScheme: "light" | "dark",
): AppThemeName {
  switch (mode) {
    case "light":
      return "light";
    case "darkWarm":
      return "dark";
    case "darkNeutral":
      return "darkNeutral";
    case "system":
      return colorScheme === "dark" ? "dark" : "light";
  }
}

export function isDarkThemeName(themeName: string | undefined): boolean {
  return themeName === "dark" || themeName === "darkNeutral";
}

const store = createMMKV({ id: "appearance" });

const MODE_KEY = "appearance.mode";

export function readStoredAppearanceMode(): AppearanceMode {
  return sanitizeAppearanceMode(store.getString(MODE_KEY));
}

export function writeStoredAppearanceMode(mode: AppearanceMode): void {
  store.set(MODE_KEY, mode);
}
