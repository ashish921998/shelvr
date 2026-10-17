import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { slotLabel } from "@/components/trip/trip-day-panel";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import type { TripStopView } from "@/lib/trip";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  stop: TripStopView;
  index: number;
  color: string;
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
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const tint = filled
    ? theme.colors.onTint
    : active
      ? theme.colors.danger
      : theme.colors.foreground;
  return (
    <Animated.View
      style={[styles.actionWrap, filled && styles.actionWide, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={() => {
          pop.set(
            withSequence(
              withSpring(0.92, { duration: 120 }),
              withSpring(1, { duration: 300, dampingRatio: 0.5 }),
            ),
          );
          onPress();
        }}
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
    </Animated.View>
  );
}

/**
 * One stop, opened from its pin or its row: the save's cover and creator,
 * the reason, and what to do next.
 */
export function TripStopSheet({
  stop,
  index,
  color,
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
            entering={ZoomIn.springify().damping(16)}
            style={styles.cover}
          >
            {stop.cover ? (
              <Image
                source={{ uri: stop.cover }}
                style={styles.fill}
                contentFit="cover"
                transition={200}
              />
            ) : null}
            <View style={[styles.coverBadge, { backgroundColor: color }]}>
              <ThemedText variant="captionStrong" style={styles.onTint}>
                {index + 1}
              </ThemedText>
            </View>
          </Animated.View>
        </Pressable>
        <Animated.View
          key={`text-${stop.itemId}-${stop.name}`}
          entering={FadeIn.duration(220)}
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
        <Action
          icon="arrow.left.arrow.right"
          label={t("trip.swap")}
          disabled={!canSwap || swapping}
          onPress={onSwap}
        />
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
