import { t, useAppLocale } from "@/lib/i18n";
import { settleSheet, stepSheet, type SheetSnaps } from "@/lib/city-sheet";
import { motion } from "@/lib/motion";
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export function moveSheet(top: SharedValue<number>, to: number) {
  top.set(withSpring(to, motion.spring.snap));
}

type Props = {
  snaps: SheetSnaps;
  /** The sheet's distance from the top of the screen. */
  top: SharedValue<number>;
  /** The grabber's drag area: stays put while the list below it scrolls. */
  header: ReactNode;
  children: ReactNode;
};

/** The places list over the city map: drag its header up to read the whole list, or down to explore the map. */
export function CitySheet({ snaps, top, header, children }: Props) {
  useAppLocale();
  const start = useSharedValue(0);
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
          start.set(top.get());
        })
        .onChange((event) => {
          top.set(
            Math.min(
              snaps.collapsed,
              Math.max(snaps.expanded, start.get() + event.translationY),
            ),
          );
        })
        .onEnd((event) => {
          top.set(
            withSpring(settleSheet(top.get(), event.velocityY, snaps), {
              ...motion.spring.snap,
              velocity: event.velocityY,
            }),
          );
        }),
    [snaps, start, top],
  );
  const placed = useAnimatedStyle(() => ({ top: top.get() }));

  return (
    <Animated.View style={[styles.sheet, placed]}>
      <GestureDetector gesture={drag}>
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
        >
          <View style={styles.grabber} />
          {header}
        </View>
      </GestureDetector>
      {children}
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
