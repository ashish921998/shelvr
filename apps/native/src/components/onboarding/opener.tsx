import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { motion, motionCSS } from "@/lib/motion";
import { HEADLINE_MAX_SCALE, useLargeText } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import { PhoneFrame } from "@/components/onboarding/opener-phone";
import {
  FiledToast,
  FileScene,
  PlanScene,
  ShareScene,
  type SceneProps,
} from "@/components/onboarding/opener-scenes";
import { CtaButton } from "@/components/onboarding/parts";
import { useEffect, useRef, useState, type ComponentType } from "react";
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
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

type Page = {
  key: "save" | "file" | "plan";
  title: TextMessageKey;
  accent: TextMessageKey;
  body: TextMessageKey;
  Scene: ComponentType<SceneProps>;
  Overlay?: ComponentType;
};

const PAGES: Page[] = [
  {
    key: "save",
    title: "onboarding.openerSaveTitle",
    accent: "onboarding.openerSaveAccent",
    body: "onboarding.openerSaveBody",
    Scene: ShareScene,
  },
  {
    key: "file",
    title: "onboarding.openerFileTitle",
    accent: "onboarding.openerFileAccent",
    body: "onboarding.openerFileBody",
    Scene: FileScene,
    Overlay: FiledToast,
  },
  {
    key: "plan",
    title: "onboarding.openerPlanTitle",
    accent: "onboarding.openerPlanAccent",
    body: "onboarding.openerPlanBody",
    Scene: PlanScene,
  },
];

const COPY_MIN_HEIGHT = 150;
const AUTO_ADVANCE_MS = 4000;

function useLiveReducedMotion() {
  const [reduced, setReduced] = useState(useReducedMotion());
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
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
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const [reached, setReached] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const reducedMotion = useLiveReducedMotion();
  const pager = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (viewedPages.has(page)) return;
    viewedPages.add(page);
    analytics.capture("onboarding_opener_page_viewed", { page_index: page });
  }, [page, viewedPages]);

  useEffect(() => {
    if (swiped || reducedMotion || size.width <= 0) return;
    if (page >= PAGES.length - 1) return;
    const timer = setTimeout(() => {
      pager.current?.scrollTo({ x: (page + 1) * size.width, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [page, swiped, reducedMotion, size.width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    if (layoutMeasurement.width <= 0) return;
    const nearest = Math.round(contentOffset.x / layoutMeasurement.width);
    const next = Math.min(PAGES.length - 1, Math.max(0, nearest));
    setPage(next);
    setReached((current) => Math.max(current, next));
  };

  const signIn = (
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
  );

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => setSwiped(true)}
        onLayout={onLayout}
        style={styles.pager}
      >
        {size.width > 0
          ? PAGES.map((item, index) => (
              <ScrollView
                key={item.key}
                style={{ width: size.width, height: size.height }}
                contentContainerStyle={styles.page}
                alwaysBounceVertical={false}
                showsVerticalScrollIndicator={false}
              >
                <PhoneFrame
                  overlay={
                    item.Overlay && index <= reached ? <item.Overlay /> : null
                  }
                >
                  <item.Scene shown={index <= reached} />
                </PhoneFrame>
                <View style={styles.copy}>
                  <Text
                    style={styles.headline}
                    maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
                  >
                    {t(item.title)}{" "}
                    <Text style={styles.headlineAccent}>{t(item.accent)}</Text>
                  </Text>
                  <Text style={styles.support}>{t(item.body)}</Text>
                </View>
                {largeText ? signIn : null}
              </ScrollView>
            ))
          : null}
      </ScrollView>

      <View
        style={styles.dots}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {PAGES.map((item, index) => (
          <Animated.View
            key={item.key}
            testID={`opener-dot-${index}`}
            style={[
              styles.dot,
              index === page && styles.dotOn,
              {
                transitionProperty: ["width", "backgroundColor"],
                transitionDuration: motion.duration.state,
                transitionTimingFunction: motionCSS.out,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.foot}>
        <CtaButton label={t("onboarding.startYours")} onPress={onStart} />
        {largeText ? null : signIn}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  pager: {
    flex: 1,
    marginHorizontal: -theme.gap(3),
  },
  page: {
    flexGrow: 1,
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(3),
  },
  copy: {
    minHeight: COPY_MIN_HEIGHT,
    gap: theme.gap(1),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 32,
    lineHeight: 38,
    color: theme.colors.foreground,
  },
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  support: {
    ...theme.type.body,
    lineHeight: 22,
    color: theme.colors.muted,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: theme.colors.border,
  },
  dotOn: {
    width: 20,
    backgroundColor: theme.colors.primary,
  },
  foot: {
    gap: theme.gap(1.5),
  },
  signIn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  signInText: {
    ...theme.type.subhead,
    color: theme.colors.muted,
  },
  signInLink: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
}));
