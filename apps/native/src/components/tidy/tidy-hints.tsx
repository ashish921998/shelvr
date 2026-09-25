import { t, useAppLocale } from "@/lib/i18n";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { type FC } from "react";
import { Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { motion } from "@/lib/motion";
import { useCardAnimation } from "@/lib/tidy/card-animation";
import { swipeProgress } from "@/lib/tidy/swipe-decision";

// Direction hint overlay, adapted from the Slack Catch Up recreation's
// color-background + mark-view: a solid tint per swipe direction plus a badge
// whose circular arc fills as the drag approaches the commit threshold.

const BADGE_SIZE = 60;
const STROKE_WIDTH = 3;
const ICON_SIZE = 24;

type Direction = "keep" | "delete" | "save";

/**
 * Fraction of the commit threshold the dominant axis has covered toward this
 * direction, 0 at rest, 1 at commit. A direction's cue fills only when that
 * direction is the one the release would act on: a diagonal lights one
 * badge instead of two, and a downward-dominant drag lights none.
 */
function useDirectionProgress(direction: Direction) {
  const { panX, panY, panDistanceX, panDistanceY } = useCardAnimation();

  return useDerivedValue(() => {
    const { action, progress } = swipeProgress(
      panX.get(),
      panY.get(),
      panDistanceX,
      panDistanceY,
    );
    return action === direction ? progress : 0;
  });
}

const Tint: FC<{ direction: Direction; color: string }> = ({
  direction,
  color,
}) => {
  const progress = useDirectionProgress(direction);

  const rTintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.get(),
      [0, 1],
      [0, 0.55],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View
      style={[styles.tint, rTintStyle, { backgroundColor: color }]}
    />
  );
};

type BadgeProps = {
  direction: Direction;
  label: string;
  icon: AppSymbolName;
  accentColor: string;
};

const Badge: FC<BadgeProps> = ({ direction, label, icon, accentColor }) => {
  const progress = useDirectionProgress(direction);

  const rBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Small buffer so the fill flips as the arc looks visually complete.
  const buffer = STROKE_WIDTH / 2 / BADGE_SIZE;

  const rCircleStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      progress.get() + buffer > 1 ? "white" : "transparent",
      motion.timing.fade,
    ),
  }));

  const rAccentIconStyle = useAnimatedStyle(() => ({
    opacity: withTiming(
      progress.get() + buffer > 1 ? 1 : 0,
      motion.timing.fade,
    ),
  }));

  const arcPath = useDerivedValue(() => {
    const skPath = Skia.Path.Make();
    const sweepDegrees = Math.max(0, progress.get()) * 360;
    skPath.addArc(
      {
        x: STROKE_WIDTH / 2,
        y: STROKE_WIDTH / 2,
        width: BADGE_SIZE - STROKE_WIDTH,
        height: BADGE_SIZE - STROKE_WIDTH,
      },
      -90,
      sweepDegrees,
    );
    return skPath;
  });

  return (
    <Animated.View style={[styles.badge, rBadgeStyle]}>
      <Animated.View style={[styles.badgeCircle, rCircleStyle]}>
        <Canvas style={styles.badgeCanvas}>
          <Path
            path={arcPath}
            color="white"
            style="stroke"
            strokeWidth={STROKE_WIDTH}
            strokeCap="round"
          />
        </Canvas>
        <View style={styles.badgeIconStack}>
          <Animated.View style={styles.badgeIcon}>
            <AppSymbolIcon name={icon} size={ICON_SIZE} tintColor="white" />
          </Animated.View>
          <Animated.View style={[styles.badgeIcon, rAccentIconStyle]}>
            <AppSymbolIcon
              name={icon}
              size={ICON_SIZE}
              tintColor={accentColor}
            />
          </Animated.View>
        </View>
      </Animated.View>
      <Text style={styles.badgeLabel}>{label}</Text>
    </Animated.View>
  );
};

export const TidyHints: FC = () => {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <View style={styles.container} pointerEvents="none">
      <Tint direction="keep" color={theme.colors.keep} />
      <Tint direction="delete" color={theme.colors.danger} />
      <Tint direction="save" color={theme.colors.primary} />
      <View style={styles.topRow}>
        <Badge
          direction="delete"
          label={t("common.delete")}
          icon="trash"
          accentColor={theme.colors.danger}
        />
        <Badge
          direction="keep"
          label={t("tidy.keep")}
          icon="checkmark"
          accentColor={theme.colors.onKeep}
        />
      </View>
      <View style={styles.bottomRow}>
        <Badge
          direction="save"
          label={t("tidy.save")}
          icon="arrow.up"
          accentColor={theme.colors.primary}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    // The swipe recognizer uses physical X coordinates in both layout directions.
    direction: "ltr",
    position: "absolute",
    top: theme.gap(3),
    left: theme.gap(3),
    right: theme.gap(3),
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  bottomRow: {
    position: "absolute",
    bottom: theme.gap(4),
    left: 0,
    right: 0,
    alignItems: "center",
  },
  badge: {
    alignItems: "center",
    gap: theme.gap(1),
  },
  badgeCircle: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCanvas: {
    position: "absolute",
    width: BADGE_SIZE,
    height: BADGE_SIZE,
  },
  badgeIconStack: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIcon: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: "white",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 6,
  },
}));
