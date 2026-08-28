import {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

// Shared motion vocabulary for state-driven UI. Keep the JS and CSS forms in
// sync so layout animations and Reanimated CSS transitions feel identical.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_OUT_CSS = cubicBezier(0.23, 1, 0.32, 1);

// Reduced motion keeps the state change legible without translation or scale.
export const REDUCED_FADE_IN = FadeIn.duration(120).easing(EASE_OUT);
export const REDUCED_FADE_OUT = FadeOut.duration(120).easing(EASE_OUT);
