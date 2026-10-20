import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn, fadeOut, motion, motionCSS } from "@/lib/motion";
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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

// The opener: three pages to swipe through, each a phone showing one thing
// Shelvr does, with "Start yours" under all of them. The pain first (losing
// the places you save), then the filing, then the trip.

type Page = {
  key: "save" | "file" | "plan";
  title: TextMessageKey;
  accent: TextMessageKey;
  body: TextMessageKey;
  Scene: ComponentType<SceneProps>;
  /** Drawn over the phone's edge, outside its screen. */
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

// Two headline lines and three body lines. Every page's copy gets at least
// this, so the headline sits at the same height on each page and the phone
// above it does not change size as the pages go by.
const COPY_MIN_HEIGHT = 150;

export function OpenerStep({
  onStart,
  onSignIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
}) {
  useAppLocale();
  // At the accessibility sizes the copy can outgrow its page, so each page
  // scrolls on its own and the sign-in link joins the first page's copy
  // instead of taking footer height from every page.
  const largeText = useLargeText();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  // The furthest page reached. A page's entrance (the share sheet, the
  // toast) plays when the page is first reached, not offscreen on mount.
  const [reached, setReached] = useState(0);
  const viewedRef = useRef(new Set<number>());

  useEffect(() => {
    // Swiping back to a page says nothing new; the funnel counts first views.
    if (viewedRef.current.has(page)) return;
    viewedRef.current.add(page);
    analytics.capture("onboarding_opener_page_viewed", { page_index: page });
  }, [page]);

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
      {/* The pager runs edge to edge, past the onboarding screen's gutter,
          so a page slides across the whole screen; its content keeps the
          gutter. The pages wait for the pager's size, since each page is
          exactly one pager wide. */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onLayout}
        style={styles.pager}
      >
        {size.width > 0
          ? PAGES.map((item, index) => (
              <ScrollView
                key={item.key}
                style={{ width: size.width, height: size.height }}
                contentContainerStyle={styles.page}
                scrollEnabled={largeText}
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
                {largeText && index === 0 ? signIn : null}
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
              // The dots change in place, so they take the state budget.
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
        {/* The slot keeps the link's height on every page, so the button
            above it never moves when the link goes. */}
        {largeText ? null : (
          <View style={styles.signInSlot}>
            {page === 0 ? (
              <Animated.View entering={fadeIn} exiting={fadeOut}>
                {signIn}
              </Animated.View>
            ) : null}
          </View>
        )}
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
    // The onboarding screen's horizontal gutter, given back here.
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
  signInSlot: {
    minHeight: 44,
    justifyContent: "center",
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
