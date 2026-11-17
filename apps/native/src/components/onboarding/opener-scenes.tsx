import { t } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export type Point = { x: number; y: number };

const BLOCKS = [
  { left: "6%", top: "8%", width: "26%", height: "18%" },
  { left: "40%", top: "6%", width: "32%", height: "14%" },
  { left: "8%", top: "40%", width: "20%", height: "24%" },
  { left: "50%", top: "36%", width: "40%", height: "18%" },
  { left: "32%", top: "52%", width: "14%", height: "16%" },
] as const;

export type MapSize = { width: number; height: number };

/** The drawn city map shown on the sign-in phone: blocks, a river, and whatever the caller puts on it once its size is known. */
export function SceneMap({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: (size: MapSize) => ReactNode;
}) {
  const [size, setSize] = useState<MapSize>({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };
  return (
    <View style={[styles.map, style]} onLayout={onLayout}>
      {BLOCKS.map((block, index) => (
        <View key={index} style={[styles.block, block]} />
      ))}
      <View style={styles.river} />
      {size.width > 0 ? children(size) : null}
    </View>
  );
}

/** A numbered pin at `point`, a fraction of the map. */
export function MapPin({
  number,
  point,
  style,
}: {
  number: number;
  point: Point;
  style?: ComponentProps<typeof Animated.View>["style"];
}) {
  return (
    <Animated.View
      style={[
        styles.pin,
        { left: `${point.x * 100}%`, top: `${point.y * 100}%` },
        style,
      ]}
    >
      <Text style={styles.pinText}>{number}</Text>
    </Animated.View>
  );
}

export type SceneStop = { slot: TextMessageKey; name: TextMessageKey };

/** A titled list of stops: the time of day, then the place. */
export function DayStops({
  title,
  stops,
}: {
  title: string;
  stops: readonly SceneStop[];
}) {
  return (
    <View style={styles.dayStops}>
      <Text style={styles.dayTitle}>{title}</Text>
      {stops.map((stop) => (
        <View key={stop.slot} style={styles.stop}>
          <Text
            style={styles.stopSlot}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t(stop.slot)}
          </Text>
          <Text
            style={styles.stopName}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {t(stop.name)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const PIN = 22;

const styles = StyleSheet.create((theme) => ({
  map: {
    flex: 1,
    minHeight: 120,
    marginTop: theme.gap(1),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  block: {
    position: "absolute",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  river: {
    position: "absolute",
    left: "-10%",
    right: "-10%",
    bottom: "-8%",
    height: "20%",
    transform: [{ rotate: "-7deg" }],
    backgroundColor: theme.colors.border,
  },
  pin: {
    position: "absolute",
    width: PIN,
    height: PIN,
    marginLeft: -PIN / 2,
    marginTop: -PIN / 2,
    borderRadius: PIN / 2,
    borderWidth: 2,
    borderColor: theme.colors.frame,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  pinText: {
    ...theme.type.badge,
    color: theme.colors.onTint,
  },
  dayStops: {
    gap: theme.gap(0.75),
  },
  dayTitle: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  stopSlot: {
    ...theme.type.badge,
    // Wide enough to line the English names up; a longer translation takes
    // the room it needs and the place name shrinks instead.
    minWidth: 72,
    maxWidth: "50%",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  stopName: {
    ...theme.type.captionLabel,
    flex: 1,
    color: theme.colors.foreground,
  },
}));
