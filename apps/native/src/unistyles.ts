import { StyleSheet } from "react-native-unistyles";
import { Appearance } from "react-native";
import { motion } from "@/lib/motion";
import {
  readStoredAppearanceMode,
  resolveThemeName,
  type AppThemeName,
} from "@/lib/appearance";

const fonts = {
  regular: "Satoshi-Regular",
  medium: "Satoshi-Medium",
  bold: "Satoshi-Bold",
  display: "CrimsonProRoman-Regular",
} as const;

const shared = {
  fonts,
  type: {
    hero: { fontFamily: fonts.display, fontSize: 48 },
    displayTitle: { fontFamily: fonts.display, fontSize: 34 },
    largeTitle: { fontFamily: fonts.display, fontSize: 26 },
    sheetTitle: { fontFamily: fonts.display, fontSize: 24 },
    title: { fontFamily: fonts.display, fontSize: 22 },
    header: { fontFamily: fonts.display, fontSize: 19 },
    displaySmall: { fontFamily: fonts.display, fontSize: 18 },
    reader: { fontFamily: fonts.regular, fontSize: 18 },
    headline: { fontFamily: fonts.bold, fontSize: 17 },
    body: { fontFamily: fonts.regular, fontSize: 16 },
    bodyLabel: { fontFamily: fonts.medium, fontSize: 16 },
    button: { fontFamily: fonts.bold, fontSize: 16 },
    subhead: { fontFamily: fonts.regular, fontSize: 15 },
    subheadLabel: { fontFamily: fonts.medium, fontSize: 15 },
    subheadStrong: { fontFamily: fonts.bold, fontSize: 15 },
    footnote: { fontFamily: fonts.regular, fontSize: 14 },
    secondaryLabel: { fontFamily: fonts.medium, fontSize: 14 },
    caption: { fontFamily: fonts.regular, fontSize: 13 },
    label: { fontFamily: fonts.medium, fontSize: 13 },
    labelStrong: { fontFamily: fonts.bold, fontSize: 13 },
    captionLabel: { fontFamily: fonts.medium, fontSize: 12 },
    captionStrong: { fontFamily: fonts.bold, fontSize: 12 },
    finePrint: { fontFamily: fonts.regular, fontSize: 11 },
    badge: { fontFamily: fonts.bold, fontSize: 10 },
  },
  gap: (v: number) => v * 8,
  motion,
  opacity: { pressed: 0.7, disabled: 0.4 },
  control: { minHeight: 48, pressRetentionOffset: 12 },
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
    muted: "#6f6455",
    faint: "#6f6455",
    primary: "#e6a23c",
    primaryForeground: "#2b2418",
    primarySoft: "#f7e8cd",
    primaryText: "#935d09",
    border: "#ece3d1",
    imageBorder: "rgba(0, 0, 0, 0.07)",
    frame: "#ffffff",
    danger: "#b75232",
    overlay: "rgba(43, 36, 24, 0.45)",
    onTint: "#2b2418",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    tabTint: "#8a5a0b",
    bezel: "#2b2418",
    globeOcean: "#e9eef0",
    globeLand: "#e4d6bb",
    globeLandEdge: "#cdbb98",
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
    frame: "#231e16",
    danger: "#e07a58",
    overlay: "rgba(0, 0, 0, 0.55)",
    onTint: "#2b2418",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    tabTint: "#e6a23c",
    bezel: "#0e0b07",
    globeOcean: "#1f2a2e",
    globeLand: "#3b3427",
    globeLandEdge: "#54493a",
  },
} as const;

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
    frame: "#1b1f24",
    danger: "#ff6f5e",
    overlay: "rgba(0, 0, 0, 0.6)",
    onTint: "#111417",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    tabTint: "#e6a23c",
    bezel: "#07090b",
    globeOcean: "#1a2530",
    globeLand: "#30363d",
    globeLandEdge: "#48505a",
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
  // Declaration merging needs interfaces; type aliases cannot merge.
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

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
