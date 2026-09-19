// A segmented pill: a well of surfaceMuted with a paper thumb that slides to
// the chosen option. It replaces a list of radio rows where the options are few
// and comparable — three appearance modes, say — so the choice reads as one
// control rather than three lines.

import { useState } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { EASE_OUT } from "@/lib/motion";

const HEIGHT = 40;
const PADDING = 3;

export type Segment<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  style,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );
  const slot =
    segments.length > 0 ? (width - PADDING * 2) / segments.length : 0;

  const thumb = useAnimatedStyle(() => {
    const x = PADDING + slot * index;
    return {
      width: slot,
      transform: [
        {
          translateX: reduced
            ? x
            : withTiming(x, { duration: 240, easing: EASE_OUT }),
        },
      ],
    };
  }, [slot, index, reduced]);

  return (
    <View
      style={[styles.well, style]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 ? <Animated.View style={[styles.thumb, thumb]} /> : null}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            style={styles.segment}
            onPress={() => onChange(segment.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={segment.label}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  well: {
    height: HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    padding: PADDING,
    borderRadius: 50,
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumb: {
    position: "absolute",
    left: 0,
    top: PADDING,
    bottom: PADDING,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    shadowColor: "#2b2418",
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segment: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
  labelSelected: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
}));
