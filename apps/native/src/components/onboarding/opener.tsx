import {
  FULL_PHONE_HEIGHT,
  FULL_PHONE_WIDTH,
  PhoneFrame,
} from "@/components/onboarding/opener-phone";
import { Wordmark } from "@/components/wordmark";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { useLargeText } from "@/lib/use-large-text";
import { useLiveReducedMotion } from "@/lib/use-live-reduced-motion";
import type { TextMessageKey } from "@/locales/message-types";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const APP_ICON = require("../../../assets/icon.png");

type Page = {
  key: "cities" | "file" | "plan" | "date";
  title: TextMessageKey;
  accent?: TextMessageKey;
  body?: TextMessageKey;
  source: number;
};

const PAGES: Page[] = [
  {
    key: "cities",
    title: "opener.yourCities",
    source: require("../../../assets/onboarding/your-cities.webp"),
  },
  {
    key: "file",
    title: "onboarding.openerFileTitle",
    accent: "onboarding.openerFileAccent",
    body: "onboarding.openerFileBody",
    source: require("../../../assets/onboarding/san-francisco-places.webp"),
  },
  {
    key: "date",
    title: "plan.dateNight",
    source: require("../../../assets/onboarding/san-francisco-date.webp"),
  },
  {
    key: "plan",
    title: "trip.yourTripNoCity",
    source: require("../../../assets/onboarding/san-francisco-trip.webp"),
  },
];

const AUTO_ADVANCE_MS = 3000;
const LEADING_PREVIEWS = 2;
const DECK = [
  ...PAGES.slice(-LEADING_PREVIEWS),
  ...PAGES,
  ...PAGES.slice(0, LEADING_PREVIEWS),
];

function logicalPage(index: number) {
  return (index - LEADING_PREVIEWS + PAGES.length) % PAGES.length;
}

function useScreenReader() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (active) => {
        changed = true;
        setEnabled(active);
      },
    );
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((active) => {
        if (mounted && !changed) setEnabled(active);
      })
      .catch((error: unknown) =>
        analytics.captureError("screen_reader_read_failed", error),
      );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

function PhonePreview({
  item,
  index,
  position,
  stride,
  height,
  scale,
}: {
  item: Page;
  index: number;
  position: SharedValue<number>;
  stride: number;
  height: number;
  scale: number;
}) {
  const emphasis = useAnimatedStyle(() => {
    const distance = position.get() - index;
    const angle = interpolate(distance, [-1, 1], [-18, 18], "clamp");
    const proximity = Math.min(1, Math.abs(distance));
    return {
      opacity: 1 - proximity * 0.84,
      transform: [
        { perspective: 900 },
        { rotateY: `${angle}deg` },
        { scale: 1 - proximity * 0.04 },
      ],
    };
  });

  return (
    <View style={[styles.slot, { width: stride, height }]}>
      <Animated.View style={emphasis}>
        <View style={{ transform: [{ scale }] }}>
          <PhoneFrame full>
            <Image
              source={item.source}
              style={styles.previewImage}
              contentFit="cover"
            />
          </PhoneFrame>
        </View>
      </Animated.View>
    </View>
  );
}

function OpenerCarousel({
  width,
  paused,
  onInteract,
  viewedPages,
}: {
  width: number;
  paused: boolean;
  onInteract: () => void;
  viewedPages: Set<number>;
}) {
  const [page, setPage] = useState(0);
  const [trackHeight, setTrackHeight] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);
  const deckIndex = useRef(LEADING_PREVIEWS);
  const autoTarget = useRef<number | null>(null);
  const position = useSharedValue(LEADING_PREVIEWS);
  const stride = Math.max(1, Math.round(width * 0.68));
  const scale = Math.min(
    (width * 0.64) / FULL_PHONE_WIDTH,
    (trackHeight * 0.98) / FULL_PHONE_HEIGHT,
  );
  const initialOffset = useMemo(
    () => ({ x: LEADING_PREVIEWS * stride, y: 0 }),
    [stride],
  );
  const active = PAGES[page];

  useEffect(() => {
    if (viewedPages.has(page)) return;
    viewedPages.add(page);
    analytics.capture("onboarding_opener_page_viewed", { page_index: page });
  }, [page, viewedPages]);

  useEffect(() => {
    if (paused || trackHeight === 0) return;
    const timer = setTimeout(() => {
      const target = (deckIndex.current + 1) * stride;
      autoTarget.current = target;
      pager.current?.scrollTo({ x: target, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [page, paused, stride, trackHeight]);

  const updatePosition = (offset: number) => {
    const next = Math.max(0, Math.min(DECK.length - 1, offset / stride));
    position.set(next);
    const index = Math.round(next);
    if (index === deckIndex.current) return;
    deckIndex.current = index;
    setPage(logicalPage(index));
  };

  const recenter = (x: number) => {
    const index = Math.round(x / stride);
    const canonical = logicalPage(index) + LEADING_PREVIEWS;
    if (Math.abs(x - index * stride) > 1 || index === canonical) return;
    pager.current?.scrollTo({ x: canonical * stride, animated: false });
    updatePosition(canonical * stride);
  };

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    recenter(event.nativeEvent.contentOffset.x);
  };

  const stopAutoplay = () => {
    autoTarget.current = null;
    onInteract();
  };

  const onScroll = ({
    nativeEvent,
  }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { x } = nativeEvent.contentOffset;
    updatePosition(x);
    if (autoTarget.current === null || Math.abs(x - autoTarget.current) > 1)
      return;
    autoTarget.current = null;
    recenter(x);
  };

  const title = active.accent
    ? `${t(active.title)} ${t(active.accent)}`
    : t(active.title);
  const pageLabel = active.body ? `${title} ${t(active.body)}` : title;

  return (
    <>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={pageLabel}
        accessibilityValue={{ min: 0, max: PAGES.length - 1, now: page }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          const next = page + (nativeEvent.actionName === "increment" ? 1 : -1);
          const index =
            ((next + PAGES.length) % PAGES.length) + LEADING_PREVIEWS;
          stopAutoplay();
          pager.current?.scrollTo({ x: index * stride, animated: false });
          updatePosition(index * stride);
        }}
        onLayout={({ nativeEvent }) =>
          setTrackHeight(nativeEvent.layout.height)
        }
        style={styles.track}
      >
        {trackHeight > 0 ? (
          <ScrollView
            ref={pager}
            horizontal
            contentInsetAdjustmentBehavior="never"
            contentOffset={initialOffset}
            contentContainerStyle={{ paddingHorizontal: (width - stride) / 2 }}
            snapToInterval={stride}
            decelerationRate="fast"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            bounces={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onScroll={onScroll}
            onScrollBeginDrag={stopAutoplay}
            onScrollEndDrag={settle}
            onMomentumScrollEnd={settle}
          >
            {DECK.map((item, index) => (
              <PhonePreview
                key={`${item.key}-${index}`}
                item={item}
                index={index}
                stride={stride}
                height={trackHeight}
                scale={scale}
                position={position}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View
        style={styles.slideInfo}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={styles.slideTitle}
          numberOfLines={2}
          maxFontSizeMultiplier={1.5}
        >
          {title}
        </Text>
        <View style={styles.dots}>
          {PAGES.map((item, index) => (
            <View
              key={item.key}
              testID={`opener-dot-${index}`}
              style={[styles.dot, page === index && styles.dotOn]}
            />
          ))}
        </View>
      </View>
    </>
  );
}

export function OpenerStep({
  onStart,
  onSignIn,
  viewedPages,
}: {
  onStart: () => void;
  onSignIn: () => void;
  viewedPages: Set<number>;
}) {
  useAppLocale();
  const largeText = useLargeText();
  const reducedMotion = useLiveReducedMotion();
  const screenReader = useScreenReader();
  const [interacted, setInteracted] = useState(false);
  const [width, setWidth] = useState(0);
  const pause = () => setInteracted(true);

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    setWidth(nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={pause}
      >
        <View style={styles.intro}>
          <View style={styles.brand} accessibilityRole="header">
            <Image source={APP_ICON} style={styles.icon} />
            <Wordmark size={32} />
          </View>
          <Text style={styles.tagline}>{t("opener.tagline")}</Text>
        </View>
        <View
          style={styles.carousel}
          onLayout={onLayout}
          testID="opener-carousel"
        >
          {width > 0 ? (
            <OpenerCarousel
              key={width}
              width={width}
              paused={interacted || reducedMotion || screenReader || largeText}
              onInteract={pause}
              viewedPages={viewedPages}
            />
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [styles.start, pressed && styles.pressed]}
        >
          <Text style={styles.startText}>{t("opener.getStarted")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
        >
          <Text style={styles.signInText}>
            {t("onboarding.haveAccount")}{" "}
            <Text style={styles.signInLink}>{t("onboarding.signIn")}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
  },
  body: {
    flex: 1,
    marginHorizontal: -theme.gap(3),
  },
  bodyContent: {
    flexGrow: 1,
    gap: theme.gap(1),
  },
  intro: {
    alignItems: "center",
    paddingHorizontal: theme.gap(3),
    gap: theme.gap(0.75),
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  icon: {
    width: theme.gap(3),
    height: theme.gap(3),
    borderRadius: theme.radius.sm,
  },
  tagline: {
    ...theme.type.footnote,
    color: theme.colors.muted,
    textAlign: "center",
    maxWidth: 280,
  },
  carousel: {
    flex: 1,
    minHeight: 304,
  },
  track: {
    flex: 1,
    overflow: "hidden",
  },
  slot: {
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    flex: 1,
  },
  slideInfo: {
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(1.5),
  },
  slideTitle: {
    ...theme.type.title,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.gap(0.625),
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.muted,
    opacity: 0.28,
  },
  dotOn: {
    width: 14,
    backgroundColor: theme.colors.primaryText,
    opacity: 1,
  },
  foot: {
    paddingTop: theme.gap(0.5),
    marginHorizontal: -theme.gap(1),
  },
  start: {
    minHeight: 52,
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  startText: {
    ...theme.type.button,
    textAlign: "center",
    color: theme.colors.background,
  },
  signIn: {
    minHeight: 44,
    paddingVertical: theme.gap(0.5),
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  signInText: {
    ...theme.type.footnote,
    color: theme.colors.muted,
    textAlign: "center",
  },
  signInLink: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
}));
