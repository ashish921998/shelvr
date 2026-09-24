// Nav E — the floating paper pill. The bar is a sheet of the same paper the
// shelves sit on, and the active tab is a save card standing on it. Changing
// tab is not a slide: an invisible hand redraws the bar (see
// `lib/nav-shelf-motion.ts` for the beats).
//
// Solid, never glass: glass is the one cool digital material in a design made
// of paper and ink, and it blurs the shelves, which are the point.

import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Path, Skia } from "@shopify/react-native-skia";
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as Haptics from "expo-haptics";
import { useTabTrigger } from "expo-router/ui";
import { InkCanvas, InkStrokes, INK_A11Y } from "@/components/ink/ink-canvas";
import { bezier, ease, span } from "@/lib/ink/geometry";
import {
  iconStrokes,
  iconStrokeWidth,
  type InkIconName,
} from "@/lib/ink/icons";
import {
  cardOutline,
  INACTIVE_OPACITY,
  NAME_TAG_MS,
  NAV_BEATS,
  pencilArc,
  TAB_CHANGE_MS,
  tabCentre,
} from "@/lib/nav-shelf-motion";
import { t } from "@/lib/i18n";
import {
  reconcileTabSelection,
  requestTabSelection,
  type TabSelection,
} from "@/lib/tab-selection";
import type { GestureResponderEvent } from "react-native";

/** Search is a plain fifth tab now; the bar no longer owns a search field. */
export const SHELF_TABS = [
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
  {
    name: "(search)",
    href: "/(app)/(tabs)/(search)",
    label: "navigation.search",
    icon: "magnifyingglass",
    testID: "tab-search",
  },
] as const satisfies readonly {
  name: string;
  href: string;
  label: string;
  icon: InkIconName;
  testID: string;
}[];

const PILL_HEIGHT = 64;
const PILL_SIDE_INSET = 22;
const PILL_PADDING = 6;
const ICON_SIZE = 22;
const CARD_SIZE = 44;
/** Room for the pill plus the gap under it. Root-tab content pads by this. */
export const TAB_BAR_CLEARANCE = 110;

export function tap() {
  if (Platform.OS !== "android") return;
  void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key);
}

/** A trigger's own press handler emits `tabPress` before switching, which pops
 * a focused tab's stack back to its root. */
export function pressTrigger(trigger: ReturnType<typeof useTabTrigger>) {
  trigger.triggerProps.onPress?.(undefined as unknown as GestureResponderEvent);
}

export function ShelfTabBar({ restingBottom }: { restingBottom: number }) {
  const { theme } = useUnistyles();
  const { width: windowWidth } = useWindowDimensions();
  const reduced = useReducedMotion();

  // One call per route rather than a loop, so the hook order never changes.
  const home = useTabTrigger({ name: SHELF_TABS[0].name });
  const spaces = useTabTrigger({ name: SHELF_TABS[1].name });
  const tidy = useTabTrigger({ name: SHELF_TABS[2].name });
  const map = useTabTrigger({ name: SHELF_TABS[3].name });
  const search = useTabTrigger({ name: SHELF_TABS[4].name });
  const triggers = useMemo(
    () => [home, spaces, tidy, map, search],
    [home, spaces, tidy, map, search],
  );

  const focusedIndex = triggers.findIndex(
    (trigger) => trigger.triggerProps.isFocused,
  );

  // The hand starts redrawing on the tap, not when navigation lands, so the
  // selection is held here and reconciled once the route catches up. Without
  // that, a second tap during the first change would be undone by the first
  // navigation's effect arriving late.
  const [selection, setSelection] = useState<TabSelection>({
    index: Math.max(focusedIndex, 0),
    revision: 0,
    pending: false,
  });
  // Adjusted during render rather than in an effect: the reconcile has to
  // happen before this render paints, or the bar shows the old tab for a frame.
  const [reconciledFor, setReconciledFor] = useState(focusedIndex);
  if (reconciledFor !== focusedIndex) {
    setReconciledFor(focusedIndex);
    setSelection((current) =>
      reconcileTabSelection(current, focusedIndex, current.revision),
    );
  }
  const activeIndex = selection.index;

  const pillWidth = windowWidth - PILL_SIDE_INSET * 2;
  const count = SHELF_TABS.length;

  // `change` runs 0..1 over one hand movement. `from` and `to` hold the tabs
  // it is travelling between; both settle on the active tab when it is done.
  const change = useSharedValue(1);
  const from = useSharedValue(activeIndex);
  const to = useSharedValue(activeIndex);
  const tag = useSharedValue(0);
  const previous = useRef(activeIndex);

  useEffect(() => {
    if (previous.current === activeIndex) return;
    from.value = previous.current;
    to.value = activeIndex;
    previous.current = activeIndex;
    if (reduced) {
      // Reduced motion: the card jumps and the icons swap, with nothing drawn.
      change.value = 1;
      tag.value = 0;
      return;
    }
    change.value = 0;
    change.value = withTiming(1, {
      duration: TAB_CHANGE_MS,
      easing: Easing.linear,
    });
    tag.value = 0;
    tag.value = withTiming(1, { duration: NAME_TAG_MS, easing: Easing.linear });
  }, [activeIndex, reduced, change, from, to, tag]);

  const cardStyle = useAnimatedStyle(() => {
    const centre = tabCentre(to.value, pillWidth, count, PILL_PADDING);
    const appear = reduced
      ? 1
      : ease(span(change.value, NAV_BEATS.card[0], NAV_BEATS.card[1]));
    return {
      transform: [
        { translateX: centre - CARD_SIZE / 2 },
        { scale: 0.9 + appear * 0.1 },
        { rotate: "-2deg" },
      ],
      opacity: appear,
    };
  }, [pillWidth, count, reduced]);

  const tagStyle = useAnimatedStyle(() => {
    const centre = tabCentre(to.value, pillWidth, count, PILL_PADDING);
    // In over the first 14%, held to 70%, then away.
    const inP = ease(span(tag.value, 0, 0.14));
    const outP = ease(span(tag.value, 0.7, 1));
    const shown = inP * (1 - outP);
    return {
      transform: [{ translateX: centre - 50 }, { translateY: (1 - shown) * 6 }],
      opacity: reduced ? 0 : shown,
    };
  }, [pillWidth, count, reduced]);

  return (
    <View
      style={[styles.wrap, { bottom: restingBottom + 26 }]}
      pointerEvents="box-none"
    >
      <Animated.View style={[styles.tag, tagStyle]} {...INK_A11Y}>
        <Text style={styles.tagText} numberOfLines={1}>
          {t(SHELF_TABS[activeIndex].label).toUpperCase()}
        </Text>
      </Animated.View>

      <View style={[styles.pill, { width: pillWidth, height: PILL_HEIGHT }]}>
        <Animated.View
          style={[
            styles.card,
            {
              width: CARD_SIZE,
              height: CARD_SIZE,
              top: (PILL_HEIGHT - CARD_SIZE) / 2,
            },
            cardStyle,
          ]}
          {...INK_A11Y}
        />

        <NavSketch
          width={pillWidth}
          height={PILL_HEIGHT}
          change={change}
          from={from}
          to={to}
          count={count}
          color={theme.colors.faint}
        />

        <View style={styles.row}>
          {SHELF_TABS.map((tab, index) => (
            <TabButton
              key={tab.name}
              tab={tab}
              index={index}
              active={index === activeIndex}
              change={change}
              from={from}
              to={to}
              reduced={reduced}
              onPress={() => {
                tap();
                setSelection((current) => requestTabSelection(current, index));
                pressTrigger(triggers[index]);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** One tab: the drawn icon over a full-strength copy of itself at 45%, so the
 * strokes can retract as you leave and ink in as you arrive. */
function TabButton({
  tab,
  index,
  active,
  change,
  from,
  to,
  reduced,
  onPress,
}: {
  tab: (typeof SHELF_TABS)[number];
  index: number;
  active: boolean;
  change: SharedValue<number>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  reduced: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const strokes = useMemo(
    () => iconStrokes(tab.icon, ICON_SIZE, index),
    [tab.icon, index],
  );
  const base = useDerivedValue(() => 1, []);

  const drawn = useDerivedValue(() => {
    if (reduced) return active ? 1 : 0;
    if (to.value === index)
      return ease(span(change.value, NAV_BEATS.arrive[0], NAV_BEATS.arrive[1]));
    if (from.value === index)
      return (
        1 - ease(span(change.value, NAV_BEATS.leave[0], NAV_BEATS.leave[1]))
      );
    return 0;
  }, [change, from, to, index, reduced, active]);

  return (
    <Pressable
      style={styles.tab}
      onPress={onPress}
      testID={tab.testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t(tab.label)}
    >
      <InkCanvas width={ICON_SIZE} height={ICON_SIZE}>
        <InkStrokes
          strokes={strokes}
          progress={base}
          color={theme.colors.foreground}
          width={iconStrokeWidth(ICON_SIZE)}
          opacity={INACTIVE_OPACITY}
          originX={ICON_SIZE / 2}
          originY={ICON_SIZE / 2}
        />
        <InkStrokes
          strokes={strokes}
          progress={drawn}
          color={theme.colors.foreground}
          width={iconStrokeWidth(ICON_SIZE)}
          opacity={0.95}
          originX={ICON_SIZE / 2}
          originY={ICON_SIZE / 2}
        />
      </InkCanvas>
    </Pressable>
  );
}

/** The pencil line that wanders to the new tab, and the outline sketched there
 * before the paper card arrives. Both are rebuilt each frame because the path
 * itself moves, unlike a static drawing that is only trimmed. */
function NavSketch({
  width,
  height,
  change,
  from,
  to,
  count,
  color,
}: {
  width: number;
  height: number;
  change: SharedValue<number>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  count: number;
  color: string;
}) {
  const line = useDerivedValue(() => {
    const path = Skia.Path.Make();
    if (from.value === to.value) return path;
    const head = ease(
      span(change.value, NAV_BEATS.lineHead[0], NAV_BEATS.lineHead[1]),
    );
    const tail = ease(
      span(change.value, NAV_BEATS.lineTail[0], NAV_BEATS.lineTail[1]),
    );
    if (head <= tail) return path;
    const [p0, p1, p2, p3] = pencilArc(
      tabCentre(from.value, width, count, PILL_PADDING),
      tabCentre(to.value, width, count, PILL_PADDING),
      height,
    );
    const pts = bezier(p0, p1, p2, p3, 50);
    const a = Math.floor(tail * (pts.length - 1));
    const b = Math.max(a + 2, Math.floor(head * (pts.length - 1)));
    for (let i = a; i < Math.min(b, pts.length); i++) {
      const [x, y] = pts[i];
      if (i === a) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
  }, [change, from, to, width, height, count]);

  const sketch = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const drawn = ease(
      span(change.value, NAV_BEATS.sketch[0], NAV_BEATS.sketch[1]),
    );
    if (drawn <= 0) return path;
    const outline = cardOutline(CARD_SIZE, 9, to.value);
    const centre = tabCentre(to.value, width, count, PILL_PADDING);
    const top = (height - CARD_SIZE) / 2;
    const upto = Math.max(2, Math.floor(drawn * outline.length));
    for (let i = 0; i < Math.min(upto, outline.length); i++) {
      const [x, y] = outline[i];
      const px = centre - CARD_SIZE / 2 + x;
      const py = top + y;
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    }
    return path;
  }, [change, to, width, height, count]);

  const sketchOpacity = useDerivedValue(
    () =>
      0.9 *
      (1 -
        ease(
          span(change.value, NAV_BEATS.sketchFade[0], NAV_BEATS.sketchFade[1]),
        )),
    [change],
  );

  return (
    <InkCanvas width={width} height={height} style={styles.sketch}>
      <Group opacity={0.85}>
        <Path
          path={line}
          color={color}
          style="stroke"
          strokeWidth={1.1}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
      <Group opacity={sketchOpacity}>
        <Path
          path={sketch}
          color={color}
          style="stroke"
          strokeWidth={1.2}
          strokeCap="round"
          strokeJoin="round"
        />
      </Group>
    </InkCanvas>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    position: "absolute",
    left: PILL_SIDE_INSET,
    right: PILL_SIDE_INSET,
    alignItems: "center",
  },
  pill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: "#2b2418",
    shadowOpacity: 0.45,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PILL_PADDING,
  },
  tab: {
    flex: 1,
    height: PILL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    position: "absolute",
    left: 0,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    shadowColor: "#2b2418",
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  sketch: { position: "absolute", left: 0, top: 0 },
  tag: {
    position: "absolute",
    left: 0,
    bottom: PILL_HEIGHT + 10,
    width: 100,
    alignItems: "center",
  },
  tagText: {
    backgroundColor: "#ffffff",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: theme.colors.foreground,
    transform: [{ rotate: "-2deg" }],
  },
}));
