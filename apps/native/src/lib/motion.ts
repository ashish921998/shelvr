import { Easing, FadeIn, FadeOut } from "react-native-reanimated";

// Shared motion vocabulary for state-driven UI. The CSS form went with the
// share screen's bespoke button: the shared ink buttons drive their own press
// with Reanimated, so nothing needs a CSS transition curve any more.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Reduced motion keeps the state change legible without translation or scale.
export const REDUCED_FADE_IN = FadeIn.duration(120).easing(EASE_OUT);
export const REDUCED_FADE_OUT = FadeOut.duration(120).easing(EASE_OUT);
