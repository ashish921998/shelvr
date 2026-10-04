import { t } from "@/lib/i18n";
import { SLIDE_COUNT } from "@/lib/paywall-plans";
import type { TextMessageKey } from "@/locales/message-types";
import { useEffect, useMemo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { StepHeading, useCompactPaywall } from "./parts";
import { FilingSlide } from "./slides/filing-slide";
import { SearchSlide } from "./slides/search-slide";
import { ShareSlide } from "./slides/share-slide";
import { ShotsSlide } from "./slides/shots-slide";

const AUTOPLAY_MS = 3800;
const SLIDE_TIMING = {
  duration: 550,
  easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  reduceMotion: ReduceMotion.System,
};

const CAPTIONS: readonly { title: TextMessageKey; body: TextMessageKey }[] = [
  { title: "paywall.slideShareTitle", body: "paywall.slideShareBody" },
  { title: "paywall.slideShotsTitle", body: "paywall.slideShotsBody" },
  { title: "paywall.slideFilingTitle", body: "paywall.slideFilingBody" },
  { title: "paywall.slideSearchTitle", body: "paywall.slideSearchBody" },
];

/**
 * Step 1: what Pro unlocks. Four slides that advance every 3.8 s until the
 * user swipes or taps a dot, after which they stay put. Reduce Motion stops
 * autoplay and holds every slide on its resting frame.
 */
export function UnlockStep({
  slide,
  paused,
  onAutoplay,
  onPause,
  onShowSlide,
}: {
  slide: number;
  paused: boolean;
  onAutoplay: () => void;
  onPause: () => void;
  onShowSlide: (slide: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const compact = useCompactPaywall();
  const width = useWindowDimensions().width - 40;
  const cardHeight = compact ? 300 : 380;

  // One timer per slide shown, so a swipe-free slide always gets its full
  // 3.8 s and a pause cancels the next advance.
  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = setTimeout(onAutoplay, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [slide, paused, reducedMotion, onAutoplay]);

  const offset = useSharedValue(-slide * width);
  useEffect(() => {
    offset.set(withTiming(-slide * width, SLIDE_TIMING));
  }, [slide, width, offset]);
  // Where the track was when the swipe took hold, mid-transition included.
  const panStart = useSharedValue(0);

  // Memoized so a re-render hands GestureDetector the same instance; a
  // fresh one re-attaches the handler and cancels a swipe in flight.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        // Pause as the swipe takes hold, so the autoplay timer can't move
        // the slide out from under the finger.
        .onStart(() => {
          panStart.set(offset.get());
          scheduleOnRN(onPause);
        })
        .onUpdate((event) => {
          const min = -(SLIDE_COUNT - 1) * width;
          offset.set(
            Math.min(0, Math.max(min, panStart.get() + event.translationX)),
          );
        })
        .onEnd((event) => {
          const projected = offset.get() + event.velocityX * 0.15;
          const target = Math.min(
            SLIDE_COUNT - 1,
            Math.max(0, Math.round(-projected / width)),
          );
          offset.set(withTiming(-target * width, SLIDE_TIMING));
          scheduleOnRN(onShowSlide, target);
        }),
    [offset, panStart, width, onPause, onShowSlide],
  );

  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  const animate = (index: number) => !reducedMotion && index === slide;

  return (
    <View>
      <StepHeading
        eyebrow={t("paywall.unlockEyebrow")}
        title={t("paywall.unlockTitle")}
      />
      <GestureDetector gesture={pan}>
        <View style={styles.viewport}>
          <Animated.View style={[styles.track(width), track]}>
            {CAPTIONS.map((caption, index) => (
              <View
                key={caption.title}
                style={{ width }}
                accessibilityElementsHidden={index !== slide}
                importantForAccessibility={
                  index === slide ? "auto" : "no-hide-descendants"
                }
              >
                <View
                  style={styles.card(cardHeight)}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t(caption.title)}
                >
                  {index === 0 ? (
                    <ShareSlide animate={animate(0)} />
                  ) : index === 1 ? (
                    <ShotsSlide animate={animate(1)} height={cardHeight} />
                  ) : index === 2 ? (
                    <FilingSlide animate={animate(2)} />
                  ) : (
                    <SearchSlide animate={animate(3)} compact={compact} />
                  )}
                </View>
                <View style={styles.caption}>
                  <Text style={styles.captionTitle}>{t(caption.title)}</Text>
                  <Text style={styles.captionBody}>{t(caption.body)}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.dots}>
        {CAPTIONS.map((caption, index) => (
          <Pressable
            key={caption.title}
            accessibilityRole="button"
            accessibilityLabel={t("paywall.slideLabel", {
              index: String(index + 1),
              total: SLIDE_COUNT,
            })}
            accessibilityState={{ selected: index === slide }}
            hitSlop={{ top: 12, bottom: 12, left: 3, right: 3 }}
            onPress={() => onShowSlide(index)}
          >
            <Animated.View style={styles.dot(index === slide)} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  viewport: { marginTop: 28, overflow: "hidden" },
  track: (width: number) => ({
    width: width * SLIDE_COUNT,
    flexDirection: "row",
  }),
  card: (height: number) => ({
    height,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
  }),
  caption: { marginTop: 14, alignItems: "center" },
  captionTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  captionBody: {
    marginTop: 2,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.muted,
    textAlign: "center",
  },
  dots: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: (active: boolean) => ({
    width: active ? 18 : 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: active ? theme.colors.primary : theme.colors.border,
    transitionProperty: ["width", "backgroundColor"],
    transitionDuration: 300,
  }),
}));
