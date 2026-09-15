import { t, useAppLocale } from "@/lib/i18n";
import { AppSymbolIcon } from "@/components/symbol";
import {
  RUBBER_BAND_LIMIT,
  isDarkColor,
  overflowPast,
  rubberBand,
  tabIndexAt,
  tabSlotX,
  withAlpha,
} from "@/lib/tab-bar-motion";
import { setTabSearchQuery, useTabSearchQuery } from "@/lib/tab-search-query";
import {
  reconcileTabSelection,
  requestTabSelection,
  type TabSelection,
} from "@/lib/tab-selection";
import { useKeyboardVisible } from "@/lib/use-keyboard-visible";
import * as Haptics from "expo-haptics";
import {
  TabList,
  TabSlot,
  TabTrigger,
  Tabs,
  useTabTrigger,
} from "expo-router/ui";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

// The Android and web tab bar: a floating pill of four tabs beside a round
// search button. A finger can scrub across the pill, with a tick as it crosses
// each tab, and the pill stretches when pulled past its edge. Opening Search
// collapses the pill into a single button back to the last tab and grows the
// search button into the field, mirroring the iOS search tab.

const PILL_TABS = [
  {
    name: "(home)",
    href: "/(app)/(tabs)/(home)",
    label: "navigation.home",
    icon: "square.grid.2x2",
    testID: "tab-home",
  },
  {
    name: "(spaces)",
    href: "/(app)/(tabs)/(spaces)",
    label: "navigation.spaces",
    icon: "rectangle.stack",
    testID: "tab-spaces",
  },
  {
    name: "(tidy)",
    href: "/(app)/(tabs)/(tidy)",
    label: "navigation.tidy",
    icon: "photo.stack",
    testID: "tab-tidy",
  },
  {
    name: "(map)",
    href: "/(app)/(tabs)/(map)",
    label: "navigation.map",
    icon: "map",
    testID: "tab-map",
  },
] as const;

const SEARCH_TAB = {
  name: "(search)",
  href: "/(app)/(tabs)/(search)",
  label: "navigation.search",
  icon: "magnifyingglass",
} as const;

const BAR_HEIGHT = 58;
const BAR_SIDE = 16;
const BAR_GAP = 10;
const PILL_INSET = 5;
const ICON_SIZE = 22;
/** Space between the bar and the screen content above it. */
const CONTENT_GAP = 12;
/** Bar lift above the keyboard while typing a search. */
const KEYBOARD_BOTTOM = 8;
/** How far a scrubbing finger may drift above or below the pill and still pick
 * a tab. Past it, releasing cancels the switch. */
const VERTICAL_SLOP = 28;
const GLOW_SIZE = 140;
/** Largest extra stretch along the pull, as a fraction of the pill's size. */
const MAX_STRETCH = 0.1;
/** How much the cross axis narrows as the pull axis stretches. */
const SQUASH = 0.5;
/** How far the pill drifts toward the finger, as a fraction of the pull. */
const DRIFT = 0.3;
const PRESS_GROWTH = 0.03;
/** Lets the collapse settle before the keyboard slides in over it. */
const SEARCH_FOCUS_DELAY_MS = 160;
/** Sideways travel before a press counts as a scrub. Below it, a tap never
 * flashes the name bubble. */
const SCRUB_SLOP = 8;
/** Room for one tab-name bubble, centred over its tab. The bubble itself is
 * only as wide as its (translated) text. */
const SCRUB_LABEL_WIDTH = 132;
const SCRUB_LABEL_HEIGHT = 30;
/** Gap between the top of the pill and the bottom of the name bubble. */
const SCRUB_LABEL_LIFT = 10;

const PRESS_SPRING = { damping: 20, stiffness: 320, mass: 0.7 };
const MORPH_SPRING = { damping: 24, stiffness: 210, mass: 1 };
const SETTLE_SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

function tick() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
}

function tap() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key);
}

/** A tab trigger's own press handler emits `tabPress` before switching, which
 * is what pops a focused tab's stack back to its root. On native it reads
 * nothing from the event, so the bar calls it without one. */
function pressTrigger(trigger: ReturnType<typeof useTabTrigger>) {
  trigger.triggerProps.onPress?.(undefined as unknown as GestureResponderEvent);
}

export function AppTabs() {
  useAppLocale();
  const insets = useSafeAreaInsets();
  const restingBottom = Math.max(insets.bottom, 10);

  // The search text lives as long as the tabs, like the iOS Search screen's
  // own state. Signing out unmounts them, so the next account starts empty.
  useEffect(() => () => setTabSearchQuery(""), []);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="height"
      enabled={Platform.OS === "android"}
    >
      <Tabs style={styles.root} options={{ backBehavior: "history" }}>
        <TabSlot
          style={[
            styles.slot,
            { paddingBottom: restingBottom + BAR_HEIGHT + CONTENT_GAP },
          ]}
        />
        {/* Registers the routes with the navigator; FloatingTabBar draws them. */}
        <TabList style={styles.routeRegistry}>
          {[...PILL_TABS, SEARCH_TAB].map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
          ))}
        </TabList>
        <FloatingTabBar restingBottom={restingBottom} />
      </Tabs>
    </KeyboardAvoidingView>
  );
}

function FloatingTabBar({ restingBottom }: { restingBottom: number }) {
  const { theme } = useUnistyles();
  const { width: windowWidth } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const query = useTabSearchQuery();
  const inputRef = useRef<TextInput>(null);

  // One call per route rather than a loop, so the hook order never changes.
  const home = useTabTrigger({ name: PILL_TABS[0].name });
  const spaces = useTabTrigger({ name: PILL_TABS[1].name });
  const tidy = useTabTrigger({ name: PILL_TABS[2].name });
  const map = useTabTrigger({ name: PILL_TABS[3].name });
  const search = useTabTrigger({ name: SEARCH_TAB.name });
  const pillTriggers = [home, spaces, tidy, map];

  const focusedIndex = pillTriggers.findIndex(
    (trigger) => trigger.triggerProps.isFocused,
  );
  const searchFocused = search.triggerProps.isFocused;
  // The tab the collapsed pill returns to. Home when Search was reached some
  // other way, such as a deep link.
  const [returnIndex, setReturnIndex] = useState(Math.max(focusedIndex, 0));

  const pillWidth = windowWidth - BAR_SIDE * 2 - BAR_GAP - BAR_HEIGHT;
  const slotWidth = (pillWidth - PILL_INSET * 2) / PILL_TABS.length;
  const returnTab = PILL_TABS[returnIndex];

  const morph = useSharedValue(searchFocused ? 1 : 0);
  const selection = useSharedValue<TabSelection>({
    index: Math.max(focusedIndex, 0),
    revision: 0,
    pending: false,
  });
  const [renderedRevision, setRenderedRevision] = useState(0);
  const hovered = useSharedValue(-1);
  const highlightTarget = useDerivedValue(() =>
    hovered.get() >= 0 ? hovered.get() : selection.get().index,
  );
  const pressed = useSharedValue(0);
  const pullX = useSharedValue(0);
  const pullY = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const glow = useSharedValue(0);
  const searchPressed = useSharedValue(0);
  // 1 once the finger has travelled past SCRUB_SLOP since touching down.
  const scrubbing = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  // The pill scales and drifts under the finger, so a touch's view-relative
  // x/y stop matching its resting layout. Where the resting pill sits on screen
  // is recorded at touch down, and later points are measured from there.
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  // The finger driving the gesture; others are ignored. -1 when idle.
  const touchId = useSharedValue(-1);

  useEffect(() => {
    morph.set(withSpring(searchFocused ? 1 : 0, MORPH_SPRING));
  }, [morph, searchFocused]);

  useEffect(() => {
    // Check the render's revision on the UI thread, where a newer release may
    // already have selected another tab while this effect was waiting to run.
    scheduleOnUI(() => {
      selection.set(
        reconcileTabSelection(selection.get(), focusedIndex, renderedRevision),
      );
    });
  }, [focusedIndex, renderedRevision, selection]);

  useEffect(() => {
    if (!searchFocused) {
      inputRef.current?.blur();
      return;
    }
    const timer = setTimeout(
      () => inputRef.current?.focus(),
      SEARCH_FOCUS_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [searchFocused]);

  const selectTab = (index: number, revision?: number) => {
    const trigger = pillTriggers[index];
    if (!trigger) return;
    if (revision !== undefined) setRenderedRevision(revision);
    setReturnIndex(index);
    if (searchFocused) Keyboard.dismiss();
    pressTrigger(trigger);
  };

  const openSearch = () => {
    if (focusedIndex >= 0) setReturnIndex(focusedIndex);
    tap();
    pressTrigger(search);
  };

  const leaveSearch = () => {
    tap();
    selectTab(returnIndex);
  };

  // Rebuilt each render so the worklets always call this render's handlers;
  // GestureDetector updates the attached gesture in place.
  const pillGesture = Gesture.Manual()
    .shouldCancelWhenOutside(false)
    .onTouchesDown((event, manager) => {
      const touch = event.changedTouches[0];
      if (!touch || touchId.get() !== -1) return;
      manager.activate();
      touchId.set(touch.id);
      originX.set(touch.absoluteX - touch.x);
      originY.set(touch.absoluteY - touch.y);
      touchX.set(touch.x);
      touchY.set(touch.y);
      touchStartX.set(touch.x);
      scrubbing.set(0);
      pressed.set(withSpring(1, PRESS_SPRING));
      glow.set(withTiming(1, { duration: 120 }));
      if (morph.get() > 0.5) return;
      const index = tabIndexAt(
        touch.x,
        pillWidth,
        PILL_TABS.length,
        PILL_INSET,
      );
      hovered.set(index);
    })
    .onTouchesMove((event) => {
      let touch = null;
      for (let i = 0; i < event.changedTouches.length; i++) {
        if (event.changedTouches[i].id === touchId.get()) {
          touch = event.changedTouches[i];
        }
      }
      if (!touch) return;
      const x = touch.absoluteX - originX.get();
      const y = touch.absoluteY - originY.get();
      touchX.set(x);
      touchY.set(y);
      const width = morph.get() > 0.5 ? BAR_HEIGHT : pillWidth;
      pullX.set(overflowPast(x, width));
      pullY.set(overflowPast(y, BAR_HEIGHT));
      if (morph.get() > 0.5) return;
      if (
        scrubbing.get() === 0 &&
        Math.abs(x - touchStartX.get()) > SCRUB_SLOP
      ) {
        scrubbing.set(1);
      }
      const withinRow = y >= -VERTICAL_SLOP && y <= BAR_HEIGHT + VERTICAL_SLOP;
      const index = withinRow
        ? tabIndexAt(x, pillWidth, PILL_TABS.length, PILL_INSET)
        : -1;
      if (index === hovered.get()) return;
      hovered.set(index);
      if (index >= 0) {
        scheduleOnRN(tick);
      }
    })
    .onTouchesUp((event, manager) => {
      for (let i = 0; i < event.changedTouches.length; i++) {
        if (event.changedTouches[i].id === touchId.get()) {
          manager.end();
        }
      }
    })
    .onTouchesCancelled((_event, manager) => {
      manager.fail();
    })
    .onFinalize((_event, success) => {
      touchId.set(-1);
      scrubbing.set(0);
      pressed.set(withSpring(0, PRESS_SPRING));
      glow.set(withTiming(0, { duration: 320 }));
      pullX.set(withSpring(0, SETTLE_SPRING));
      pullY.set(withSpring(0, SETTLE_SPRING));
      if (morph.get() > 0.5) {
        // Collapsed, the pill is one round button: only a release over it
        // counts, so dragging off is a way to cancel.
        const x = touchX.get();
        const y = touchY.get();
        const releasedInside =
          x >= 0 && x <= BAR_HEIGHT && y >= 0 && y <= BAR_HEIGHT;
        if (success && releasedInside) scheduleOnRN(leaveSearch);
        return;
      }
      const index = hovered.get();
      if (success && index >= 0) {
        const requested = requestTabSelection(selection.get(), index);
        selection.set(requested);
        scheduleOnRN(selectTab, index, requested.revision);
      }
      hovered.set(-1);
    });

  const pillStyle = useAnimatedStyle(() => {
    const stretchX = rubberBand(pullX.get(), RUBBER_BAND_LIMIT);
    const stretchY = rubberBand(pullY.get(), RUBBER_BAND_LIMIT);
    const growX = (Math.abs(stretchX) / RUBBER_BAND_LIMIT) * MAX_STRETCH;
    const growY = (Math.abs(stretchY) / RUBBER_BAND_LIMIT) * MAX_STRETCH;
    const press = 1 + pressed.get() * PRESS_GROWTH;
    return {
      width: interpolate(morph.get(), [0, 1], [pillWidth, BAR_HEIGHT]),
      transform: [
        { translateX: stretchX * DRIFT },
        { translateY: stretchY * DRIFT },
        { scaleX: press * (1 + growX - growY * SQUASH) },
        { scaleY: press * (1 + growY - growX * SQUASH) },
      ],
    };
  });

  const tabsLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.get(), [0, 0.35], [1, 0], "clamp"),
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.get(), [0, 0.3], [1, 0], "clamp"),
    transform: [
      {
        translateX: tabSlotX(
          highlightTarget.get(),
          pillWidth,
          PILL_TABS.length,
          PILL_INSET,
        ),
      },
    ],
  }));

  const returnLayerStyle = useAnimatedStyle(() => {
    const m = morph.get();
    return {
      opacity: interpolate(m, [0.55, 1], [0, 1], "clamp"),
      transform: [{ scale: interpolate(m, [0.55, 1], [0.6, 1], "clamp") }],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const g = glow.get();
    return {
      opacity: g,
      transform: [
        { translateX: touchX.get() - GLOW_SIZE / 2 },
        { translateY: touchY.get() - GLOW_SIZE / 2 },
        { scale: interpolate(g, [0, 1], [0.6, 1]) },
      ],
    };
  });

  const searchBoxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + searchPressed.get() * 0.04 }],
  }));

  const inputLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.get(), [0.5, 1], [0, 1], "clamp"),
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.bar,
        {
          bottom:
            keyboardVisible && searchFocused ? KEYBOARD_BOTTOM : restingBottom,
        },
      ]}
    >
      {PILL_TABS.map((tab, index) => (
        <ScrubLabel
          key={tab.name}
          index={index}
          label={t(tab.label)}
          centerX={PILL_INSET + slotWidth * (index + 0.5)}
          hovered={hovered}
          scrubbing={scrubbing}
        />
      ))}
      <GestureDetector gesture={pillGesture}>
        <Animated.View style={[styles.pill, pillStyle]}>
          <View style={styles.clip}>
            <View style={styles.sheen} />
            <Animated.View
              style={[styles.highlight, { width: slotWidth }, highlightStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.glow, glowStyle]}
            />
            <Animated.View
              importantForAccessibility={
                searchFocused ? "no-hide-descendants" : "auto"
              }
              style={[styles.tabsRow, { width: pillWidth }, tabsLayerStyle]}
            >
              {PILL_TABS.map((tab, index) => {
                const focused = index === focusedIndex;
                return (
                  <View
                    key={tab.name}
                    testID={tab.testID}
                    accessible
                    accessibilityRole="tab"
                    accessibilityLabel={t(tab.label)}
                    accessibilityState={{ selected: focused }}
                    accessibilityActions={[{ name: "activate" }]}
                    onAccessibilityAction={() => selectTab(index)}
                    style={styles.tabSlot}
                  >
                    <AppSymbolIcon
                      name={tab.icon}
                      size={ICON_SIZE}
                      weight={focused ? "semibold" : "medium"}
                      tintColor={
                        focused ? theme.colors.foreground : theme.colors.muted
                      }
                    />
                  </View>
                );
              })}
            </Animated.View>
            <Animated.View
              testID="tab-bar-return"
              accessible={searchFocused}
              importantForAccessibility={
                searchFocused ? "yes" : "no-hide-descendants"
              }
              accessibilityRole="button"
              accessibilityLabel={t(returnTab.label)}
              accessibilityActions={[{ name: "activate" }]}
              onAccessibilityAction={leaveSearch}
              pointerEvents="none"
              style={[styles.returnLayer, returnLayerStyle]}
            >
              <AppSymbolIcon
                name={returnTab.icon}
                size={ICON_SIZE}
                weight="semibold"
                tintColor={theme.colors.foreground}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </GestureDetector>

      <Animated.View style={[styles.searchBox, searchBoxStyle]}>
        <View style={styles.clip}>
          <View style={styles.sheen} />
        </View>
        <Pressable
          testID="tab-search"
          accessibilityRole="button"
          accessibilityLabel={t(SEARCH_TAB.label)}
          accessibilityState={{ selected: searchFocused }}
          importantForAccessibility={
            searchFocused ? "no-hide-descendants" : "yes"
          }
          disabled={searchFocused}
          onPress={openSearch}
          onPressIn={() => searchPressed.set(withSpring(1, PRESS_SPRING))}
          onPressOut={() => searchPressed.set(withSpring(0, PRESS_SPRING))}
          style={styles.fill}
        />
        <View pointerEvents="none" style={styles.searchIcon}>
          <AppSymbolIcon
            name={SEARCH_TAB.icon}
            size={ICON_SIZE}
            weight={searchFocused ? "semibold" : "medium"}
            tintColor={
              searchFocused ? theme.colors.foreground : theme.colors.muted
            }
          />
        </View>
        <Animated.View
          pointerEvents={searchFocused ? "auto" : "none"}
          style={[styles.inputLayer, inputLayerStyle]}
        >
          <TextInput
            ref={inputRef}
            testID="tab-search-input"
            value={query}
            onChangeText={setTabSearchQuery}
            placeholder={t("search.placeholder")}
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.primary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            accessibilityLabel={t("search.placeholder")}
            style={styles.input}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** The name of the tab under a scrubbing finger, floated above the pill so the
 * finger never covers it. There is one per tab so each bubble sizes to its own
 * translation, and only the hovered one shows. It is decorative: TalkBack
 * already announces every tab by name. */
function ScrubLabel({
  index,
  label,
  centerX,
  hovered,
  scrubbing,
}: {
  index: number;
  label: string;
  centerX: number;
  hovered: SharedValue<number>;
  scrubbing: SharedValue<number>;
}) {
  const bubbleStyle = useAnimatedStyle(() => {
    const visible = scrubbing.get() === 1 && hovered.get() === index;
    return {
      opacity: withTiming(visible ? 1 : 0, { duration: visible ? 110 : 160 }),
      transform: [
        { translateY: withTiming(visible ? 0 : 6, { duration: 160 }) },
        { scale: withTiming(visible ? 1 : 0.92, { duration: 160 }) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.scrubLabelSlot,
        { left: centerX - SCRUB_LABEL_WIDTH / 2 },
        bubbleStyle,
      ]}
    >
      <View style={styles.scrubLabel}>
        <Text numberOfLines={1} style={styles.scrubLabelText}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => {
  const dark = isDarkColor(theme.colors.background);
  const surface = {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderCurve: "continuous" as const,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    boxShadow: dark
      ? "0 10px 30px rgba(0, 0, 0, 0.45)"
      : "0 10px 30px rgba(43, 36, 24, 0.16)",
  };

  return {
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    slot: {
      flex: 1,
    },
    routeRegistry: {
      display: "none",
    },
    bar: {
      position: "absolute",
      left: BAR_SIDE,
      right: BAR_SIDE,
      flexDirection: "row",
      alignItems: "center",
    },
    pill: surface,
    scrubLabelSlot: {
      position: "absolute",
      bottom: BAR_HEIGHT + SCRUB_LABEL_LIFT,
      width: SCRUB_LABEL_WIDTH,
      alignItems: "center",
    },
    scrubLabel: {
      height: SCRUB_LABEL_HEIGHT,
      paddingHorizontal: theme.gap(1.5),
      borderRadius: SCRUB_LABEL_HEIGHT / 2,
      borderCurve: "continuous",
      justifyContent: "center",
      backgroundColor: theme.colors.foreground,
      boxShadow: dark
        ? "0 6px 18px rgba(0, 0, 0, 0.5)"
        : "0 6px 18px rgba(43, 36, 24, 0.22)",
    },
    scrubLabelText: {
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      color: theme.colors.background,
    },
    searchBox: {
      ...surface,
      flex: 1,
      marginLeft: BAR_GAP,
    },
    clip: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: BAR_HEIGHT / 2,
      overflow: "hidden",
    },
    fill: {
      ...StyleSheet.absoluteFillObject,
    },
    // A soft top-lit sheen, strong enough to read on the light palette and
    // faint on the dark ones.
    sheen: {
      ...StyleSheet.absoluteFillObject,
      experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
        "#ffffff",
        dark ? 0.06 : 0.7,
      )} 0%, ${withAlpha("#ffffff", 0)} 60%)`,
    },
    highlight: {
      position: "absolute",
      top: PILL_INSET - 1,
      bottom: PILL_INSET - 1,
      left: 0,
      borderRadius: BAR_HEIGHT / 2,
      borderCurve: "continuous",
      backgroundColor: theme.colors.primarySoft,
    },
    glow: {
      position: "absolute",
      top: 0,
      left: 0,
      width: GLOW_SIZE,
      height: GLOW_SIZE,
      experimental_backgroundImage: `radial-gradient(circle, ${withAlpha(
        theme.colors.primary,
        dark ? 0.3 : 0.24,
      )} 0%, ${withAlpha(theme.colors.primary, 0)} 70%)`,
    },
    tabsRow: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      flexDirection: "row",
      paddingHorizontal: PILL_INSET,
    },
    tabSlot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    returnLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    searchIcon: {
      position: "absolute",
      top: (BAR_HEIGHT - 2 - ICON_SIZE) / 2,
      left: (BAR_HEIGHT - 2 - ICON_SIZE) / 2,
    },
    inputLayer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: BAR_HEIGHT - 6,
      right: theme.gap(2),
      justifyContent: "center",
    },
    input: {
      paddingVertical: 0,
      fontFamily: theme.fonts.regular,
      fontSize: 16,
      color: theme.colors.foreground,
    },
  };
});
