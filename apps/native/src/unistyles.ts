import { StyleSheet } from "react-native-unistyles";
import { Appearance } from "react-native";
import {
  readStoredAppearanceMode,
  resolveThemeName,
  type AppThemeName,
} from "@/lib/appearance";

const shared = {
  fonts: {
    regular: "Satoshi-Regular",
    medium: "Satoshi-Medium",
    bold: "Satoshi-Bold",
    display: "FacultyGlyphic-Regular",
  },
  gap: (v: number) => v * 8,
  radius: {
    sm: 8,
    md: 11,
    lg: 16,
    xl: 24,
  },
} as const;

const lightTheme = {
  ...shared,
  colors: {
    background: "#faf6ee",
    surface: "#fffdf8",
    surfaceMuted: "#f3ecdd",
    foreground: "#2b2418",
    muted: "#8d8271",
    faint: "#b5aa97",
    primary: "#e6a23c",
    primaryForeground: "#2b2418",
    primarySoft: "#f7e8cd",
    primaryText: "#9a6416",
    border: "#ece3d1",
    imageBorder: "rgba(0, 0, 0, 0.07)",
    danger: "#c05a3a",
    overlay: "rgba(43, 36, 24, 0.45)",
  },
} as const;

const darkTheme = {
  ...shared,
  colors: {
    background: "#191510",
    surface: "#231e16",
    surfaceMuted: "#2c261c",
    foreground: "#f4eddd",
    muted: "#a2977f",
    faint: "#6f6650",
    primary: "#e6a23c",
    primaryForeground: "#2b2418",
    primarySoft: "#3a2f1c",
    primaryText: "#f0c078",
    border: "#332c20",
    imageBorder: "rgba(255, 255, 255, 0.07)",
    danger: "#e07a58",
    overlay: "rgba(0, 0, 0, 0.55)",
  },
} as const;

// Neutral dark: gray-based surfaces with no brown cast, and a high-contrast
// yellow accent. For users who find the warm (brown-paper) dark palette hard
// to focus on.
const darkNeutralTheme = {
  ...shared,
  colors: {
    background: "#111417",
    surface: "#1b1f24",
    surfaceMuted: "#242a31",
    foreground: "#e8ebee",
    muted: "#a2abb5",
    faint: "#929ba5",
    primary: "#ffd60a",
    primaryForeground: "#111417",
    primarySoft: "#2e3339",
    primaryText: "#ffd60a",
    border: "#2c3238",
    imageBorder: "rgba(255, 255, 255, 0.08)",
    danger: "#ff6f5e",
    overlay: "rgba(0, 0, 0, 0.6)",
  },
} as const;

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
  darkNeutral: darkNeutralTheme,
};

const breakpoints = {
  xs: 0,
  sm: 300,
  md: 500,
  lg: 800,
  xl: 1200,
} as const;

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

declare module "react-native-unistyles" {
  // Module augmentation requires empty extending interfaces (type aliases can't
  // merge across declarations), so the empty-object-type rule doesn't apply.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

// Read the persisted appearance at module scope so the cold launch paints in
// the pinned theme. A pinned mode must disable adaptive theming, otherwise the
// first OS scheme change would override the user's choice.
const storedAppearanceMode = readStoredAppearanceMode();
Appearance.setColorScheme(
  storedAppearanceMode === "system"
    ? "unspecified"
    : storedAppearanceMode === "light"
      ? "light"
      : "dark",
);

const appearanceSettings =
  storedAppearanceMode === "system"
    ? ({ adaptiveThemes: true } as const)
    : ({
        initialTheme: (): AppThemeName =>
          resolveThemeName(storedAppearanceMode, "light"),
        adaptiveThemes: false,
      } as const);

StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: appearanceSettings,
});
