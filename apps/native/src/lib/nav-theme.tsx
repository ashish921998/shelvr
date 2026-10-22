import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useEffect } from "react";
import * as SystemUI from "expo-system-ui";
import { useUnistyles } from "react-native-unistyles";
import { isDarkThemeName } from "@/lib/appearance";

export function NavThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, rt } = useUnistyles();
  const appThemeIsDark = isDarkThemeName(rt.themeName);
  const base = appThemeIsDark ? DarkTheme : DefaultTheme;

  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.background,
      text: theme.colors.foreground,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return <ThemeProvider value={navTheme}>{children}</ThemeProvider>;
}
