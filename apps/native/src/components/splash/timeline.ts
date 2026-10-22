export const TIMELINE = {
  threadAboveFrom: 0.03,
  threadAboveTo: 0.62,

  burstFrom: 1.02,
  burstTo: 1.32,

  markFrom: 1.05,
  markDuration: 0.34,

  threadBelowFrom: 1.22,
  threadBelowTo: 1.6,

  lockupFrom: 1.26,
  lockupDuration: 0.42,

  canvasFadeFrom: 1.62,
  canvasFadeTo: 2.04,

  footerFrom: 1.74,
  footerDuration: 0.34,
} as const;

const SPLASH_HOLD = 0.2;
const SPLASH_EXIT = 0.22;

export const SPLASH_DURATION =
  TIMELINE.footerFrom + TIMELINE.footerDuration + SPLASH_HOLD + SPLASH_EXIT;

export const SPLASH_EXIT_FROM = SPLASH_DURATION - SPLASH_EXIT;

export const SPLASH_ANCHOR_Y = 0.46;

export type SplashPalette = {
  ink: string;
  accent: string;
  cool: string;
  thread: string;
};

type SplashTheme = {
  ground: string;
  mark: string;
  wordmark: string;
  footer: string;
  palette: SplashPalette;
};

export const SPLASH_THEMES: Record<"light" | "dark", SplashTheme> = {
  light: {
    ground: "#faf6ee",
    mark: "#e6a23c",
    wordmark: "#2b2418",
    footer: "#6a6050",
    palette: {
      ink: "#2b2418",
      accent: "#c96a3a",
      cool: "#6b7a8f",
      thread: "#b8924a",
    },
  },
  dark: {
    ground: "#191510",
    mark: "#e6a23c",
    wordmark: "#f4eddd",
    footer: "#a2977f",
    palette: {
      ink: "#f4eddd",
      accent: "#e08a5a",
      cool: "#93a6bc",
      thread: "#c9a45e",
    },
  },
};

export function splashTheme(isDark: boolean): SplashTheme {
  return isDark ? SPLASH_THEMES.dark : SPLASH_THEMES.light;
}
