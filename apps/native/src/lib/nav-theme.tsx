import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import * as SystemUI from "expo-system-ui";
import { useUnistyles } from "react-native-unistyles";
import { isDarkThemeName } from "@/lib/appearance";

// Single source of truth for the native route background. The navigator paints
// every screen's container with the navigation theme's `background`, so setting
// it here — instead of a `contentStyle` on each screen — themes all nested
// stacks at once and paints the screen container before JS content mounts (no
// white flash on push / zoom transitions). The palette follows the ACTIVE app
// theme (`rt.themeName`), not the OS scheme: the user can pin a dark
// appearance while the system stays light.
export function NavThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, rt } = useUnistyles();
  const appThemeIsDark = isDarkThemeName(rt.themeName);
  const base = appThemeIsDark ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    dark: appThemeIsDark,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.background,
      text: theme.colors.foreground,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };

  // Keep the native root view / window (behind the routes: launch, overscroll
  // bounce, transparent sheets) in sync with the theme too.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return <ThemeProvider value={navTheme}>{children}</ThemeProvider>;
}
