import { useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { isDarkThemeName } from "@/lib/appearance";
import { cubicBezierEase, span } from "@/lib/splash/composition";
import { t, useAppLocale } from "@/lib/i18n";
import { SplashMark } from "./splash-mark";
import { ThreadCanvas } from "./thread-canvas";
import {
  SPLASH_ANCHOR_Y,
  SPLASH_DURATION,
  SPLASH_EXIT_FROM,
  splashTheme,
  TIMELINE,
} from "./timeline";

const WORDMARK_SIZE = 50;
const ASCENDER = 694 / 1024;
const MARK_SIZE = Math.round(WORDMARK_SIZE * ASCENDER);
const LOCKUP_GAP = 11;
const UNFURL_OVERSHOOT = 4;

const LOCKUP_EASE = [0.16, 0.84, 0.24, 1] as const;
const FOOTER_EASE = [0.2, 0.8, 0.25, 1] as const;
const FOOTER_RISE = 5;

const REDUCED_FADE_MS = 240;

const FINISH_FALLBACK_MS = 300;

const SKIP_FADE_MS = 180;

const KEEP_TIMING = { reduceMotion: ReduceMotion.Never } as const;

export function AnimatedSplash({ onFinish }: { onFinish?: () => void }) {
  useAppLocale();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { rt } = useUnistyles();
  const splash = splashTheme(isDarkThemeName(rt.themeName));

  const [wordmarkWidth, setWordmarkWidth] = useState<number | null>(null);
  const [exiting, setExiting] = useState(false);

  const clock = useSharedValue(0);
  const reducedProgress = useSharedValue(0);
  const skipFade = useSharedValue(1);
  const finishRef = useRef<() => void>(() => {});

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onFinishRef.current?.();
    };
    finishRef.current = finish;

    if (reducedMotion) {
      reducedProgress.set(
        withTiming(1, { duration: REDUCED_FADE_MS, ...KEEP_TIMING }),
      );
    }

    clock.set(
      withTiming(
        SPLASH_DURATION,
        {
          duration: SPLASH_DURATION * 1000,
          easing: Easing.linear,
          ...KEEP_TIMING,
        },
        (completed) => {
          "worklet";
          if (completed) scheduleOnRN(finish);
        },
      ),
    );
    const exitTimer = setTimeout(
      () => setExiting(true),
      SPLASH_EXIT_FROM * 1000,
    );
    const fallbackTimer = setTimeout(
      finish,
      SPLASH_DURATION * 1000 + FINISH_FALLBACK_MS,
    );
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(fallbackTimer);
      cancelAnimation(clock);
    };
  }, [reducedMotion, clock, reducedProgress]);

  const rowStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? reducedProgress.get() : 1,
  }));

  const wordmarkStyle = useAnimatedStyle(() => {
    const full = LOCKUP_GAP + (wordmarkWidth ?? 0) + UNFURL_OVERSHOOT;
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

  const screenStyle = useAnimatedStyle(() => ({
    opacity:
      (1 - span(clock.get(), SPLASH_EXIT_FROM, SPLASH_DURATION)) *
      skipFade.get(),
  }));

  // A tap fades the splash out from wherever it is and hands over at once.
  const skip = () => {
    if (exiting) return;
    setExiting(true);
    skipFade.set(
      withTiming(0, { duration: SKIP_FADE_MS, ...KEEP_TIMING }, (completed) => {
        "worklet";
        if (completed) scheduleOnRN(finishRef.current);
      }),
    );
  };

  return (
    <Animated.View
      style={[styles.screen, screenStyle]}
      pointerEvents={exiting ? "none" : "auto"}
    >
      {reducedMotion ? null : (
        <View style={styles.canvasLayer} pointerEvents="none">
          <ThreadCanvas
            width={width}
            height={height}
            clock={clock}
            palette={splash.palette}
          />
        </View>
      )}

      <Text
        style={[styles.wordmark, styles.measure]}
        allowFontScaling={false}
        onLayout={(event) => setWordmarkWidth(event.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        shelvr
      </Text>

      <View
        style={[
          styles.lockupLayer,
          { opacity: wordmarkWidth === null ? 0 : 1 },
        ]}
        pointerEvents="none"
      >
        <Animated.View
          style={[styles.lockup, rowStyle]}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Shelvr"
        >
          <SplashMark
            size={MARK_SIZE}
            clock={clock}
            color={splash.mark}
            still={reducedMotion}
          />
          {wordmarkWidth === null ? null : (
            <Animated.View style={[styles.wordmarkClip, wordmarkStyle]}>
              <View style={styles.wordmarkInset}>
                <Text
                  style={[styles.wordmark, { width: wordmarkWidth }]}
                  allowFontScaling={false}
                >
                  shelvr
                </Text>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </View>

      <Animated.Text style={[styles.footer, footerStyle]}>
        {t("splash.tagline")}
      </Animated.Text>

      <Pressable
        testID="splash-skip"
        style={styles.skipLayer}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel={t("splash.skip")}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => {
  const splash = splashTheme(isDarkThemeName(rt.themeName));
  return {
    screen: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: splash.ground,
    },
    canvasLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    skipLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    lockupLayer: {
      position: "absolute",
      left: 0,
      right: 0,
      top: `${SPLASH_ANCHOR_Y * 100}%`,
      alignItems: "center",
      transform: [{ translateY: -WORDMARK_SIZE / 2 }],
    },
    lockup: {
      flexDirection: "row",
      alignItems: "baseline",
    },
    wordmarkClip: {
      overflow: "hidden",
      alignItems: "flex-start",
      justifyContent: "center",
    },
    wordmarkInset: {
      paddingLeft: LOCKUP_GAP,
    },
    wordmark: {
      fontFamily: theme.fonts.display,
      fontSize: WORDMARK_SIZE,
      lineHeight: WORDMARK_SIZE,
      letterSpacing: -0.2,
      color: splash.wordmark,
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
      color: splash.footer,
    },
  };
});
