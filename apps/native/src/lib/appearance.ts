import type { TextMessageKey } from "@/locales/message-types";
import { createMMKV } from "react-native-mmkv";

/**
 * User-selectable appearance. `system` follows the OS via unistyles' adaptive
 * theming (light ↔ warm dark). The other modes pin a theme: `light`, the
 * original warm dark palette (`darkWarm`), or a neutral dark palette
 * (`darkNeutral`) for users who find the warm surfaces hard to focus on.
 *
 * This module must stay free of `react-native-unistyles` imports: the
 * Unistyles config (`src/unistyles.ts`) reads the persisted mode at module
 * scope to theme the first paint, so anything it imports cannot import it
 * back. Imperative/runtime helpers live in `appearance-runtime.ts`.
 */
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

/** Corrupt or foreign stored values fall back to following the system. */
export function sanitizeAppearanceMode(value: unknown): AppearanceMode {
  return isAppearanceMode(value) ? value : "system";
}

/** Which Unistyles theme should be active for a mode. `colorScheme` is only
 * consulted for `system` (where adaptive theming normally handles it). */
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

// MMKV is synchronous, so src/unistyles.ts can read the pinned theme at module
// scope before any content paints.
const store = createMMKV({ id: "appearance" });

const MODE_KEY = "appearance.mode";

export function readStoredAppearanceMode(): AppearanceMode {
  return sanitizeAppearanceMode(store.getString(MODE_KEY));
}

export function writeStoredAppearanceMode(mode: AppearanceMode): void {
  store.set(MODE_KEY, mode);
}
