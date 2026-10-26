import { t, useAppLocale } from "@/lib/i18n";
import {
  clampSheet,
  settleSheet,
  stepSheet,
  type SheetSnaps,
} from "@/lib/city-sheet";
import { motion } from "@/lib/motion";
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";

export function moveSheet(top: SharedValue<number>, to: number) {
  top.set(withSpring(to, motion.spring.snap));
}

/** Springs the sheet to the rest point a released drag lands on. */
function settle(
  top: SharedValue<number>,
  velocityY: number,
  snaps: SheetSnaps,
) {
  "worklet";
  top.set(
    withSpring(settleSheet(top.get(), velocityY, snaps), {
      ...motion.spring.snap,
      velocity: velocityY,
    }),
  );
}

/** What the sheet's list needs so a drag on its rows can move the sheet, as in Apple Maps. */
type SheetList = {
  scrollEnabled: boolean;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  bounces: false;
};

type Props = {
  snaps: SheetSnaps;
  /** The sheet's distance from the top of the screen. */
  top: SharedValue<number>;
  /** The grabber's drag area: always moves the sheet. */
  header: ReactNode;
  /** The list under the header: scrolls once the sheet is up, and moves the sheet otherwise. */
  list: (scroll: SheetList) => React.ReactElement;
  onHeaderHeight?: (height: number) => void;
};

/** The places list over the city map: drag it up to read the whole list, or down to explore the map. */
export function CitySheet({ snaps, top, header, list, onHeaderHeight }: Props) {
  useAppLocale();
  const start = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Where the finger was when a drag on the rows took over the sheet; null while the rows scroll.
  const takeover = useSharedValue<number | null>(null);
  const [up, setUp] = useState(false);

  useAnimatedReaction(
    () => top.get() <= snaps.expanded + 1,
    (now, before) => {
      if (now !== before) scheduleOnRN(setUp, now);
    },
    [snaps],
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const { headerDrag, listDrag } = useMemo(() => {
    const headerDrag = Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onStart(() => {
        start.set(top.get());
      })
      .onChange((event) => {
        top.set(clampSheet(start.get() + event.translationY, snaps));
      })
      .onEnd((event) => {
        settle(top, event.velocityY, snaps);
      });
    const listScroll = Gesture.Native();
    const listDrag = Gesture.Pan()
      .activeOffsetY([-6, 6])
      .simultaneousWithExternalGesture(listScroll)
      .onStart(() => {
        start.set(top.get());
        takeover.set(null);
      })
      .onChange((event) => {
        const lowered = start.get() > snaps.expanded + 1;
        const pullingDownAtTop = scrollY.get() <= 0 && event.changeY > 0;
        if (takeover.get() === null && (lowered || pullingDownAtTop)) {
          takeover.set(event.translationY);
        }
        const from = takeover.get();
        if (from !== null) {
          top.set(clampSheet(start.get() + event.translationY - from, snaps));
        }
      })
      .onEnd((event) => {
        if (takeover.get() !== null) settle(top, event.velocityY, snaps);
        takeover.set(null);
      });
    return { headerDrag, listDrag: Gesture.Simultaneous(listDrag, listScroll) };
  }, [snaps, start, top, scrollY, takeover]);

  const placed = useAnimatedStyle(() => ({ top: top.get() }));

  return (
    <Animated.View style={[styles.sheet, placed]}>
      <GestureDetector gesture={headerDrag}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t("cityMap.placesList")}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) =>
            moveSheet(
              top,
              stepSheet(
                top.get(),
                event.nativeEvent.actionName === "increment" ? -1 : 1,
                snaps,
              ),
            )
          }
          style={styles.header}
          onLayout={(event) =>
            onHeaderHeight?.(event.nativeEvent.layout.height)
          }
        >
          <View style={styles.grabber} />
          {header}
        </View>
      </GestureDetector>
      {/* The detector must wrap the scroll view itself so its native scroll joins the drag. */}
      <GestureDetector gesture={listDrag}>
        {list({ scrollEnabled: up, onScroll, bounces: false })}
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  header: {
    paddingTop: theme.gap(1),
    paddingHorizontal: theme.gap(2),
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
}));
