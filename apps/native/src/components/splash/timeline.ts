// One schedule for the launch animation, in seconds from the moment it starts.
//
// The drawn layer (Skia) and the lockup layer (Reanimated views) run off the
// same clock, so their beats have to agree: the mark pops while the last saves
// are still landing, the wordmark unfurls as the thread resumes downward, and
// the footer arrives only after the lockup has settled.

export const TIMELINE = {
  /** The thread draws from off-screen down to the centre. */
  threadAboveFrom: 0.05,
  threadAboveTo: 1.35,

  /** Ring of ticks breaking outward as the saves reach the shelf. */
  burstFrom: 2.3,
  burstTo: 2.85,

  /** The S pops in over the settled row. */
  markFrom: 2.3,
  markDuration: 0.62,

  /** The thread picks back up and continues off the bottom of the screen. */
  threadBelowFrom: 2.65,
  threadBelowTo: 3.45,

  /** The wordmark unfurls while the lockup slides left into its final spot. */
  lockupFrom: 2.7,
  lockupDuration: 0.82,

  /** The drawn layer clears, leaving the lockup alone on the ground. */
  canvasFadeFrom: 3.5,
  canvasFadeTo: 4.5,

  /** Footer line, last in. */
  footerFrom: 3.8,
  footerDuration: 0.72,
} as const;

/** Beat the finished lockup is held for before the splash gives way. */
const SPLASH_HOLD = 0.5;
/** Cross-fade to the app behind the splash. */
const SPLASH_EXIT = 0.4;

/**
 * Total time the splash owns the screen, after which it hands off. The whole
 * sequence is deliberate and runs a little over five seconds; shortening the
 * launch means retiming `TIMELINE` rather than cutting this off early, which
 * would clip the animation mid-beat.
 */
export const SPLASH_DURATION =
  TIMELINE.footerFrom + TIMELINE.footerDuration + SPLASH_HOLD + SPLASH_EXIT;

/** When the cross-fade to the app begins. */
export const SPLASH_EXIT_FROM = SPLASH_DURATION - SPLASH_EXIT;

/**
 * The composition and the lockup share this anchor — a fraction of screen
 * height, slightly above true centre, which is where a lockup wants to sit.
 */
export const SPLASH_ANCHOR_Y = 0.46;

/**
 * Splash colours are pinned literals rather than theme tokens: the launch
 * screen is always the warm paper ground, even when the app itself is running
 * in one of the dark themes.
 */
export const SPLASH_GROUND = "#faf6ee";
export const SPLASH_MARK = "#e6a23c";
export const SPLASH_WORDMARK = "#2b2418";
export const SPLASH_FOOTER = "#6a6050";

export type SplashPalette = {
  /** Most of the sketched saves, and every dust mote. */
  ink: string;
  /** The warm minority — roughly one save in eight. */
  accent: string;
  /** The cool minority — rarer still. */
  cool: string;
  /** The thread itself, and the burst. */
  thread: string;
};

export const SPLASH_PALETTE: SplashPalette = {
  ink: "#2b2418",
  accent: "#c96a3a",
  cool: "#6b7a8f",
  thread: "#b8924a",
};
