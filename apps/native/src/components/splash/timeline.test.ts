import { describe, expect, it } from "vitest";

import { SCHEDULE } from "@/lib/splash/composition";
import {
  SPLASH_DURATION,
  SPLASH_EXIT_FROM,
  SPLASH_THEMES,
  splashTheme,
  TIMELINE,
} from "./timeline";

// The animation's beats live in two files — `TIMELINE` here and `SCHEDULE` in
// the composition — because the saves' times are generated where the saves
// are. These assertions are what keeps the two honest when either is retimed.

/** When the last save finishes its glide onto the shelf. */
const lastSaveLands =
  SCHEDULE.travelFrom +
  SCHEDULE.travelSpread +
  SCHEDULE.travelDurationFrom +
  SCHEDULE.travelDurationSpread;

describe("SCHEDULE", () => {
  it("draws every save before it sets off for the shelf", () => {
    expect(SCHEDULE.appearFrom + SCHEDULE.appearSpread).toBeLessThan(
      SCHEDULE.travelFrom,
    );
  });

  it("starts the dust before the saves, so the page is never bare", () => {
    expect(SCHEDULE.dustFrom).toBeLessThan(SCHEDULE.appearFrom);
  });
});

describe("TIMELINE", () => {
  it("runs the whole splash in 2.5 seconds", () => {
    expect(SPLASH_DURATION).toBeCloseTo(2.5, 5);
  });

  it("draws the thread to the centre before the saves gather there", () => {
    expect(TIMELINE.threadAboveTo).toBeLessThan(SCHEDULE.travelFrom);
  });

  it("breaks the ring while the saves are landing, not after", () => {
    expect(TIMELINE.burstFrom).toBeLessThan(lastSaveLands);
    expect(TIMELINE.burstTo).toBeLessThan(TIMELINE.canvasFadeFrom);
  });

  it("pops the mark over the settling row", () => {
    expect(TIMELINE.markFrom).toBeLessThan(lastSaveLands);
    expect(TIMELINE.markFrom).toBeLessThan(TIMELINE.lockupFrom);
  });

  it("unfurls the wordmark only once the mark has landed", () => {
    expect(TIMELINE.lockupFrom).toBeGreaterThanOrEqual(
      TIMELINE.markFrom + TIMELINE.markDuration * 0.5,
    );
  });

  it("resumes the thread downward after it reached the centre", () => {
    expect(TIMELINE.threadBelowFrom).toBeGreaterThan(TIMELINE.threadAboveTo);
    expect(TIMELINE.threadBelowTo).toBeGreaterThan(TIMELINE.threadBelowFrom);
  });

  it("holds the settled row briefly before clearing the canvas", () => {
    expect(TIMELINE.canvasFadeFrom).toBeGreaterThan(lastSaveLands);
    expect(TIMELINE.canvasFadeTo).toBeGreaterThan(TIMELINE.canvasFadeFrom);
  });

  it("brings the footer in after the lockup has settled", () => {
    expect(TIMELINE.footerFrom).toBeGreaterThanOrEqual(
      TIMELINE.lockupFrom + TIMELINE.lockupDuration,
    );
  });

  it("finishes every beat before the splash hands off", () => {
    const lastBeat = Math.max(
      TIMELINE.threadBelowTo,
      TIMELINE.canvasFadeTo,
      TIMELINE.footerFrom + TIMELINE.footerDuration,
      TIMELINE.lockupFrom + TIMELINE.lockupDuration,
      TIMELINE.markFrom + TIMELINE.markDuration,
      lastSaveLands,
    );
    expect(lastBeat).toBeLessThanOrEqual(SPLASH_DURATION);
    // And the cross-fade starts only once the last beat has played, so the
    // splash is never cut off mid-animation.
    expect(SPLASH_EXIT_FROM).toBeGreaterThanOrEqual(lastBeat);
  });
});

/** WCAG relative luminance, for comparing one ground against the other. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (byte: number) => {
    const part = byte / 255;
    return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 0xff) +
    0.7152 * channel((value >> 8) & 0xff) +
    0.0722 * channel(value & 0xff)
  );
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("splash themes", () => {
  it("picks the ground from the app theme", () => {
    expect(splashTheme(true)).toBe(SPLASH_THEMES.dark);
    expect(splashTheme(false)).toBe(SPLASH_THEMES.light);
  });

  it("keeps the mark common to both grounds", () => {
    expect(SPLASH_THEMES.dark.mark).toBe(SPLASH_THEMES.light.mark);
    expect(SPLASH_THEMES.dark.ground).not.toBe(SPLASH_THEMES.light.ground);
  });

  // No absolute floor: the shipped light palette puts the amber mark at about
  // 2:1 on warm paper, which is a deliberate look rather than a defect. What
  // has to hold is that nothing reads worse on the dark ground than it already
  // does on the light one, which is what a mistyped dark literal would break.
  it("reads at least as well on the dark ground as on the light one", () => {
    for (const role of ["mark", "wordmark", "footer"] as const) {
      expect(
        contrast(SPLASH_THEMES.dark[role], SPLASH_THEMES.dark.ground),
      ).toBeGreaterThanOrEqual(
        contrast(SPLASH_THEMES.light[role], SPLASH_THEMES.light.ground),
      );
    }
    for (const role of ["ink", "accent", "cool", "thread"] as const) {
      expect(
        contrast(SPLASH_THEMES.dark.palette[role], SPLASH_THEMES.dark.ground),
      ).toBeGreaterThanOrEqual(
        contrast(SPLASH_THEMES.light.palette[role], SPLASH_THEMES.light.ground),
      );
    }
  });
});
