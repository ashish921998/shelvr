import { UnistylesRuntime } from "react-native-unistyles";
import { Appearance } from "react-native";
import {
  readStoredAppearanceMode,
  resolveThemeName,
  writeStoredAppearanceMode,
  type AppearanceMode,
} from "@/lib/appearance";
import { useCallback, useState } from "react";

function setAppearanceMode(mode: AppearanceMode): void {
  writeStoredAppearanceMode(mode);
  Appearance.setColorScheme(
    mode === "system" ? "unspecified" : mode === "light" ? "light" : "dark",
  );
  if (mode === "system") {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(resolveThemeName(mode, "light"));
}

export function useAppearanceMode(): {
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
} {
  const [mode, setModeState] = useState<AppearanceMode>(() =>
    readStoredAppearanceMode(),
  );

  const setMode = useCallback((next: AppearanceMode) => {
    setModeState(next);
    setAppearanceMode(next);
  }, []);

  return { mode, setMode };
}
