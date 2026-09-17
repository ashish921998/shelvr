import { describe, expect, it } from "vitest";

import { SCHEDULE } from "@/lib/splash/composition";
import { SPLASH_DURATION, SPLASH_EXIT_FROM, TIMELINE } from "./timeline";

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
