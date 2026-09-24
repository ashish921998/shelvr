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
  display: "Spectral-SemiBold",
} as const;

const shared = {
  fonts,
  // The shared type ramp. Every step names a family/size pair the app already
  // renders as a literal somewhere in src/, so the ramp is the inventory of
  // type in use, not a wish list: a step with no `variant` caller yet still has
  // consumers writing its numbers by hand. Existing layouts keep their literal
  // styles; new UI reaches for these names so type stays consistent (see
  // docs/architecture/design-system.md).
  type: {
    hero: { fontFamily: fonts.display, fontSize: 48 },
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
  // The one spacing scale. Fractions are expected: gap(0.5) is 4, gap(1.5) is
  // 12. A second, named set of steps would only split the vocabulary.
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
    // Darkened from #8d8271 for WCAG AA contrast. The binding surface is
    // surfaceMuted #f3ecdd (4.92:1), where tag labels and captions sit; the
    // paper background clears 5.37:1.
    muted: "#6f6455",
    // Small captions need AA normal-text contrast on secondary surfaces too.
    faint: "#6f6455",
    primary: "#e6a23c",
    primaryForeground: "#2b2418",
    primarySoft: "#f7e8cd",
    // Darkened from #9a6416; amber-toned text must clear 4.5:1 on paper.
    primaryText: "#935d09",
    border: "#ece3d1",
    imageBorder: "rgba(0, 0, 0, 0.07)",
    // Darkened from #c05a3a so destructive text clears 4.5:1 on paper
    // (4.84:1) and the background (4.57:1); on surfaceMuted (4.18:1) and
    // primarySoft (4.07:1) it stays under AA, so destructive labels must
    // not render on those surfaces.
    danger: "#b75232",
    overlay: "rgba(43, 36, 24, 0.45)",
    // Dark label on the amber fill; white on #e6a23c is 2.19:1.
    onTint: "#2b2418",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    // NativeTabs paints the selected tab's icon AND its label with this one
    // color, so it carries small normal-size text and owes 4.5:1. Darkened
    // from #bf8114, which cleared only 3.06:1 on background, 3.25:1 on
    // surface and 2.80:1 on surfaceMuted: now 5.49, 5.82 and 5.03:1.
    tabTint: "#8a5a0b",
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
    // The amber fill is shared, so the dark label is too.
    onTint: "#2b2418",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    tabTint: "#e6a23c",
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
    onTint: "#111417",
    onOverlay: "#ffffff",
    keep: "#34d399",
    onKeep: "#065f46",
    // Matches the previous hard-coded dark tab tint on this theme.
    tabTint: "#e6a23c",
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
