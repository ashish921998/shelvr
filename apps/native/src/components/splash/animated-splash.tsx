import { useEffect, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { cubicBezierEase, span } from "@/lib/splash/composition";
import { t, useAppLocale } from "@/lib/i18n";
import { SplashMark } from "./splash-mark";
import { ThreadCanvas } from "./thread-canvas";
import {
  SPLASH_ANCHOR_Y,
  SPLASH_DURATION,
  SPLASH_EXIT_FROM,
  SPLASH_FOOTER,
  SPLASH_GROUND,
  SPLASH_PALETTE,
  SPLASH_WORDMARK,
  TIMELINE,
} from "./timeline";

// Shelvr's launch animation. A thread draws down the screen and hand-sketched
// saves — notes, recipes, articles, photos, products — gather onto a shelf at
// the centre, where they settle into stitches; the S pops in over the row, the
// wordmark unfurls beside it as the lockup slides into place, and the strapline
// arrives last.
//
// The drawn layer lives in `thread-canvas.tsx` (Skia) and the lockup here
// (Reanimated views over real text). Both read one clock, defined in
// `timeline.ts`.

const MARK_SIZE = 40;
const LOCKUP_GAP = 13;
const WORDMARK_SIZE = 46;
/** Slack past the measured wordmark, so the last glyph is never clipped. */
const UNFURL_OVERSHOOT = 4;

/** Easing the lockup's slide and unfurl share. */
const LOCKUP_EASE = [0.16, 0.84, 0.24, 1] as const;
const FOOTER_EASE = [0.2, 0.8, 0.25, 1] as const;
const FOOTER_RISE = 5;

/** With reduced motion the lockup simply fades up, and the splash ends early. */
const REDUCED_FADE_MS = 240;
const REDUCED_HOLD_MS = 900;

export function AnimatedSplash({ onFinish }: { onFinish?: () => void }) {
  useAppLocale();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  // The wordmark's natural width sets both how far the lockup slides and how
  // far the unfurl opens, so the composition waits on one measurement pass.
  const [wordmarkWidth, setWordmarkWidth] = useState<number | null>(null);

  const clock = useSharedValue(0);
  const reducedProgress = useSharedValue(0);

  useEffect(() => {
    const finish = () => onFinish?.();

    if (reducedMotion) {
      reducedProgress.set(
        withTiming(1, { duration: REDUCED_FADE_MS }, (completed) => {
          "worklet";
          if (completed) runOnJS(finish)();
        }),
      );
      const timer = setTimeout(finish, REDUCED_HOLD_MS);
      return () => clearTimeout(timer);
    }

    clock.set(
      withTiming(
        SPLASH_DURATION,
        { duration: SPLASH_DURATION * 1000, easing: Easing.linear },
        (completed) => {
          "worklet";
          if (completed) runOnJS(finish)();
        },
      ),
    );
    // The animation is started once, on mount; `onFinish` is read through the
    // closure above rather than re-armed when the callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Holds the mark centred until the wordmark unfurls, then slides the pair
  // left so the finished lockup lands optically centred.
  const shift = wordmarkWidth === null ? 0 : (wordmarkWidth + LOCKUP_GAP) / 2;

  const rowStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { opacity: reducedProgress.get(), transform: [{ translateX: 0 }] };
    }
    const progress = cubicBezierEase(
      span(
        clock.get(),
        TIMELINE.lockupFrom,
        TIMELINE.lockupFrom + TIMELINE.lockupDuration,
      ),
      LOCKUP_EASE[0],
      LOCKUP_EASE[1],
      LOCKUP_EASE[2],
      LOCKUP_EASE[3],
    );
    return { opacity: 1, transform: [{ translateX: shift * (1 - progress) }] };
  });

  const wordmarkStyle = useAnimatedStyle(() => {
    const full = (wordmarkWidth ?? 0) + UNFURL_OVERSHOOT;
    if (reducedMotion) return { width: full };
    const progress = cubicBezierEase(
      span(
        clock.get(),
        TIMELINE.lockupFrom,
        TIMELINE.lockupFrom + TIMELINE.lockupDuration,
      ),
      LOCKUP_EASE[0],
      LOCKUP_EASE[1],
      LOCKUP_EASE[2],
      LOCKUP_EASE[3],
    );
    return { width: full * progress };
  });

  const footerStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return {
        opacity: reducedProgress.get(),
        transform: [{ translateY: 0 }],
      };
    }
    const progress = cubicBezierEase(
      span(
        clock.get(),
        TIMELINE.footerFrom,
        TIMELINE.footerFrom + TIMELINE.footerDuration,
      ),
      FOOTER_EASE[0],
      FOOTER_EASE[1],
      FOOTER_EASE[2],
      FOOTER_EASE[3],
    );
    return {
      opacity: progress,
      transform: [{ translateY: FOOTER_RISE * (1 - progress) }],
    };
  });

  // The app is already mounted behind the splash, so the last beat is a
  // cross-fade rather than a cut.
  const screenStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    return {
      opacity: 1 - span(clock.get(), SPLASH_EXIT_FROM, SPLASH_DURATION),
    };
  });

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      {reducedMotion ? null : (
        <View style={styles.canvasLayer} pointerEvents="none">
          <ThreadCanvas
            width={width}
            height={height}
            clock={clock}
            palette={SPLASH_PALETTE}
          />
        </View>
      )}

      {/* Measured off-screen: an unconstrained copy reports the wordmark's
          natural width, which the clipped copy below can then be given. */}
      <Text
        style={[styles.wordmark, styles.measure]}
        onLayout={(event) => setWordmarkWidth(event.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        shelvr
      </Text>

      <View style={styles.lockupLayer} pointerEvents="none">
        <Animated.View
          style={[styles.lockup, rowStyle]}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Shelvr"
        >
          <SplashMark size={MARK_SIZE} clock={clock} />
          {wordmarkWidth === null ? null : (
            <Animated.View style={[styles.wordmarkClip, wordmarkStyle]}>
              <Text style={[styles.wordmark, { width: wordmarkWidth }]}>
                shelvr
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      </View>

      <Animated.Text style={[styles.footer, footerStyle]}>
        {t("splash.tagline")}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    ...StyleSheet.absoluteFillObject,
    // Pinned literals, not theme tokens: the launch screen stays on warm paper
    // even when the app is running in one of the dark themes.
    backgroundColor: SPLASH_GROUND,
  },
  canvasLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  lockupLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: `${SPLASH_ANCHOR_Y * 100}%`,
    alignItems: "center",
    // Centre the lockup on the anchor rather than hanging it below the line.
    transform: [{ translateY: -MARK_SIZE / 2 }],
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: LOCKUP_GAP,
  },
  wordmarkClip: {
    overflow: "hidden",
    // The clip opens from the left, so the wordmark writes itself out from
    // behind the mark instead of sliding in as a block.
    alignItems: "flex-start",
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: theme.fonts.display,
    fontSize: WORDMARK_SIZE,
    lineHeight: WORDMARK_SIZE,
    letterSpacing: -0.2,
    color: SPLASH_WORDMARK,
  },
  measure: {
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 74,
    textAlign: "center",
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    color: SPLASH_FOOTER,
  },
}));
