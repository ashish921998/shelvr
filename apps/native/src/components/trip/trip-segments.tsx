import { ThemedText } from "@/components/ui/themed-text";
import { motion } from "@/lib/motion";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type LayoutRectangle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  labels: string[];
  selected: number;
  onSelect: (index: number) => void;
  /** The pill behind the selected label. Defaults to the surface color. */
  tintFor?: (index: number) => string;
  /** Day tabs scroll sideways; the pace control fills its row. */
  scroll?: boolean;
  accessibilityLabel?: string;
};

/**
 * A row of choices with one pill that glides to the selected one, used for
 * the trip's pace, its city and its day tabs.
 */
export function TripSegments({
  labels,
  selected,
  onSelect,
  tintFor,
  scroll = false,
  accessibilityLabel,
}: Props) {
  const { theme } = useUnistyles();
  const [layouts, setLayouts] = useState<Record<number, LayoutRectangle>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const target = layouts[selected];
  const measured = useSharedValue(false);

  useEffect(() => {
    if (target === undefined) return;
    if (!measured.get()) {
      // First layout: the pill starts where it belongs, no slide from 0.
      x.set(target.x);
      width.set(target.width);
      measured.set(true);
      return;
    }
    x.set(withSpring(target.x, motion.spring.drag));
    width.set(withSpring(target.width, motion.spring.drag));
  }, [target, x, width, measured]);

  const pill = useAnimatedStyle(() => ({
    opacity: measured.value ? 1 : 0,
    width: width.value,
    transform: [{ translateX: x.value }],
  }));

  const row = (
    <View
      style={[styles.row, !scroll && styles.fill]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          { backgroundColor: tintFor?.(selected) ?? theme.colors.surface },
          pill,
        ]}
      />
      {labels.map((label, index) => {
        const active = index === selected;
        return (
          <Pressable
            key={`${index}-${label}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setLayouts((prev) => ({ ...prev, [index]: layout }));
            }}
            onPress={() => {
              if (active) return;
              if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
              onSelect(index);
            }}
            hitSlop={4}
            style={[styles.segment, !scroll && styles.segmentFill]}
          >
            <ThemedText
              variant={active ? "labelStrong" : "label"}
              numberOfLines={1}
              style={
                active ? (tintFor ? styles.onTint : styles.active) : styles.idle
              }
            >
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scroll) return <View style={styles.track}>{row}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroller}
    >
      {row}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    padding: theme.gap(0.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  scroller: {
    paddingHorizontal: theme.gap(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  fill: {
    alignSelf: "stretch",
  },
  pill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  segment: {
    minHeight: 36,
    paddingHorizontal: theme.gap(1.75),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  segmentFill: {
    flex: 1,
  },
  active: {
    color: theme.colors.foreground,
  },
  onTint: {
    color: theme.colors.onTint,
  },
  idle: {
    color: theme.colors.muted,
  },
}));
