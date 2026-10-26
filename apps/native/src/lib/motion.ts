import {
  cubicBezier,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideInLeft,
  SlideInRight,
  SlideOutDown,
  SlideOutLeft,
  SlideOutRight,
} from "react-native-reanimated";

const curves = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

const duration = {
  feedback: 120,
  state: 180,
  enter: 250,
  exit: 200,
  // A critically damped spring settles in this long (Apple's fluid-interface default).
  spring: 350,
  // The gap between items that arrive one after another, like pins dropping.
  stagger: 300,
} as const;
const easing = {
  out: Easing.bezier(...curves.out),
  inOut: Easing.bezier(...curves.inOut),
};

// cubicBezier() objects are class instances Reanimated cannot serialize to the UI runtime, so they stay out of `motion`.
export const motionCSS = {
  out: cubicBezier(...curves.out),
};

export const motion = {
  duration,
  easing,
  timing: {
    feedback: {
      duration: duration.feedback,
      easing: easing.out,
      reduceMotion: ReduceMotion.System,
    },
    enter: {
      duration: duration.enter,
      easing: easing.out,
      reduceMotion: ReduceMotion.System,
    },
    fade: {
      duration: duration.feedback,
      easing: easing.out,
      reduceMotion: ReduceMotion.Never,
    },
  },
  textMorph: {
    stagger: 25,
    enterDelay: 120,
    glideDelay: 140,
    enterRise: 14,
    exitUp: 12,
    exitRight: 8,
    scale: 0.7,
    blur: 6,
    enter: {
      duration: 550,
      dampingRatio: 1,
      reduceMotion: ReduceMotion.System,
    },
    reveal: {
      duration: 260,
      easing: easing.out,
      reduceMotion: ReduceMotion.System,
    },
    exit: {
      duration: 240,
      easing: easing.out,
      reduceMotion: ReduceMotion.System,
    },
    glide: {
      duration: 320,
      easing: easing.inOut,
      reduceMotion: ReduceMotion.System,
    },
  },
  spring: {
    snap: {
      duration: duration.spring,
      dampingRatio: 1,
      reduceMotion: ReduceMotion.System,
    },
    settle: {
      duration: 400,
      dampingRatio: 1,
      reduceMotion: ReduceMotion.System,
    },
    drag: {
      duration: 400,
      dampingRatio: 0.8,
      reduceMotion: ReduceMotion.System,
    },
  },
  scale: { pressed: 0.97 },
} as const;

export const fadeIn = FadeIn.duration(duration.enter)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);
export const fadeOut = FadeOut.duration(duration.exit)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);

export const settleIn = (delay: number) =>
  FadeIn.delay(delay)
    .duration(520)
    .easing(easing.out)
    .reduceMotion(ReduceMotion.Never);

export const riseIn = FadeInDown.duration(duration.enter)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.System);

export const REDUCED_FADE_IN = FadeIn.duration(duration.feedback)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);
export const REDUCED_FADE_OUT = FadeOut.duration(duration.feedback)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);

/** A critically damped spring entrance: no overshoot, interruptible, and a short cross-fade under Reduce Motion. */
export const springIn = (reduced: boolean, delay = 0) =>
  reduced
    ? FadeIn.delay(delay).duration(duration.feedback).easing(easing.out)
    : FadeInDown.delay(delay)
        .springify(duration.spring)
        .dampingRatio(1)
        .reduceMotion(ReduceMotion.Never);

/** A screen of a step-by-step flow: forward arrives from the right, Back leaves to the right. */
export function stepTransition(reduced: boolean, backward: boolean) {
  if (reduced) return { entering: REDUCED_FADE_IN, exiting: REDUCED_FADE_OUT };
  const [entering, exiting] = backward
    ? [SlideInLeft, SlideOutRight]
    : [SlideInRight, SlideOutLeft];
  return {
    entering: entering.springify(duration.spring).dampingRatio(1),
    exiting: exiting.springify(duration.spring).dampingRatio(1),
  };
}

/** A sheet that comes up from the bottom and leaves downward. */
export const sheetIn = (reduced: boolean, delay = 0) =>
  reduced
    ? FadeIn.delay(delay).duration(duration.feedback)
    : SlideInDown.delay(delay).springify(duration.spring).dampingRatio(1);
export const sheetOut = (reduced: boolean) =>
  reduced
    ? FadeOut.duration(duration.feedback)
    : SlideOutDown.springify(duration.spring).dampingRatio(1);
