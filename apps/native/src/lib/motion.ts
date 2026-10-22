import {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";

const curves = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

const duration = { feedback: 120, state: 180, enter: 250, exit: 200 } as const;
const easing = {
  out: Easing.bezier(...curves.out),
  inOut: Easing.bezier(...curves.inOut),
};

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

export const REDUCED_FADE_IN = FadeIn.duration(duration.feedback)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);
export const REDUCED_FADE_OUT = FadeOut.duration(duration.feedback)
  .easing(easing.out)
  .reduceMotion(ReduceMotion.Never);
