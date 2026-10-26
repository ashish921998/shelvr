import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { slotLabel } from "@/components/trip/trip-day-panel";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn, motion } from "@/lib/motion";
import type { TripStopView } from "@/lib/trip";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, { withTiming } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const ENTER = motion.timing.enter;

function coverIn() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.95 }] },
    animations: {
      opacity: withTiming(1, ENTER),
      transform: [{ scale: withTiming(1, ENTER) }],
    },
  };
}

type Props = {
  stop: TripStopView;
  index: number;
  visited: boolean;
  canSwap: boolean;
  swapping: boolean;
  onClose: () => void;
  onDirections: () => void;
  onSwap: () => void;
  onToggleVisited: () => void;
  onOpenSave: () => void;
};

function Action({
  icon,
  label,
  onPress,
  filled = false,
  active = false,
  disabled = false,
  accessibilityLabel,
}: {
  icon: AppSymbolName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useUnistyles();
  const tint = filled
    ? theme.colors.onTint
    : active
      ? theme.colors.danger
      : theme.colors.foreground;
  return (
    <View style={[styles.actionWrap, filled && styles.actionWide]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.action,
          filled ? styles.actionFilled : styles.actionOpen,
          active && styles.actionActive,
          (pressed || disabled) && styles.pressed,
        ]}
      >
        <AppSymbolIcon name={icon} size={15} tintColor={tint} />
        <ThemedText
          variant="button"
          numberOfLines={1}
          style={filled ? styles.onTint : active ? styles.went : undefined}
        >
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

export function TripStopSheet({
  stop,
  index,
  visited,
  canSwap,
  swapping,
  onClose,
  onDirections,
  onSwap,
  onToggleVisited,
  onOpenSave,
}: Props) {
  useAppLocale();
  const { theme } = useUnistyles();
  const color = theme.colors.primary;
  return (
    <View style={styles.sheet}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("trip.openSave")}
          onPress={onOpenSave}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Animated.View
            key={`${stop.itemId}-${stop.name}`}
            entering={coverIn}
            style={[
              styles.cover,
              !stop.cover && { backgroundColor: `${color}26` },
            ]}
          >
            {stop.cover ? (
              <Image
                source={{ uri: stop.cover }}
                style={styles.fill}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.noCover}>
                <AppSymbolIcon name="map" size={28} tintColor={color} />
              </View>
            )}
            <View style={[styles.coverBadge, { backgroundColor: color }]}>
              <ThemedText variant="captionStrong" style={styles.onTint}>
                {index + 1}
              </ThemedText>
            </View>
          </Animated.View>
        </Pressable>
        <Animated.View
          key={`text-${stop.itemId}-${stop.name}`}
          entering={fadeIn}
          style={styles.text}
        >
          <ThemedText variant="captionStrong" style={{ color }}>
            {t("trip.stopEyebrow", {
              number: String(index + 1),
              slot: slotLabel(stop.slot),
            })}
          </ThemedText>
          <ThemedText variant="title" numberOfLines={2}>
            {stop.name}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted}>
            {stop.why}
          </ThemedText>
          <Pressable accessibilityRole="link" onPress={onOpenSave} hitSlop={6}>
            <ThemedText
              variant="caption"
              style={styles.faint}
              numberOfLines={1}
            >
              {stop.creator
                ? t("trip.yourSaveBy", { creator: stop.creator })
                : t("trip.yourSave")}
            </ThemedText>
          </Pressable>
        </Animated.View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="xmark"
            size={12}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Action
          filled
          icon="arrow.triangle.turn.up.right.diamond.fill"
          label={t("trip.directions")}
          onPress={onDirections}
        />
        {canSwap ? (
          <Action
            icon="arrow.left.arrow.right"
            label={t("trip.swap")}
            disabled={swapping}
            onPress={onSwap}
          />
        ) : null}
        <Action
          icon="checkmark"
          label={visited ? t("plan.been") : t("plan.weWent")}
          accessibilityLabel={`${stop.name}, ${visited ? t("plan.been") : t("plan.weWent")}`}
          active={visited}
          onPress={onToggleVisited}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: {
    gap: theme.gap(2),
  },
  top: {
    flexDirection: "row",
    gap: theme.gap(1.5),
    alignItems: "flex-start",
  },
  cover: {
    width: theme.gap(11),
    height: theme.gap(14),
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  noCover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  coverBadge: {
    position: "absolute",
    left: theme.gap(0.75),
    top: theme.gap(0.75),
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  onTint: {
    color: theme.colors.onTint,
  },
  text: {
    flex: 1,
    gap: theme.gap(0.5),
    paddingTop: theme.gap(0.25),
  },
  muted: {
    color: theme.colors.muted,
  },
  faint: {
    color: theme.colors.faint,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  actions: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  actionWrap: {
    flex: 1,
  },
  actionWide: {
    flex: 1.4,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1),
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  actionFilled: {
    backgroundColor: theme.colors.primary,
  },
  actionOpen: {
    borderColor: theme.colors.border,
  },
  actionActive: {
    borderColor: theme.colors.danger,
  },
  went: {
    color: theme.colors.danger,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
