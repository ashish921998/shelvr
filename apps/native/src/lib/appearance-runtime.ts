import { UnistylesRuntime } from 'react-native-unistyles';
import { Appearance } from 'react-native';
import {
  readStoredAppearanceMode,
  resolveThemeName,
  writeStoredAppearanceMode,
  type AppearanceMode,
} from '@/lib/appearance';
import { useCallback, useState } from 'react';

/**
 * Imperative appearance application. Lives apart from `appearance.ts` (which
 * must not import react-native-unistyles — see the note there) and is the only
 * place that drives the Unistyles runtime.
 *
 * `system` re-arms adaptive theming so the app follows the OS again. Pinned
 * modes disable adaptivity (otherwise the OS scheme would override the user's
 * choice) and select the theme directly — the OS itself can stay light while
 * the app renders dark.
 */
export function setAppearanceMode(mode: AppearanceMode): void {
  writeStoredAppearanceMode(mode);
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode === 'light' ? 'light' : 'dark');
  if (mode === 'system') {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(resolveThemeName(mode, 'light'));
}

/** Profile-screen state for the appearance preference. The stored value is the
 * source of truth for the preference; Unistyles owns the derived theme. */
export function useAppearanceMode(): {
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
} {
  const [mode, setModeState] = useState<AppearanceMode>(
    () => readStoredAppearanceMode(),
  );

  const setMode = useCallback((next: AppearanceMode) => {
    setModeState(next);
    setAppearanceMode(next);
  }, []);

  return { mode, setMode };
}
