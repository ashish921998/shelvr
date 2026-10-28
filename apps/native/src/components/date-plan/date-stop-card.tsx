import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { stopBadge } from "@/lib/trip-planner";
import type { DateStop } from "@convex/model/datePlan";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function CardAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: AppSymbolName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name={icon}
        size={14}
        tintColor={theme.colors.primaryText}
      />
      <ThemedText variant="labelStrong" style={styles.actionText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** One stop of the evening: what it is for, the place, and its actions. */
export function DateStopCard({
  stop,
  number,
  slot,
  color,
  onColor,
  onOpen,
  onSwap,
}: {
  stop: DateStop;
  number: number;
  /** "Dinner", "Drinks or dessert", "Coffee", "A walk". */
  slot: string;
  /** The pin's colour on the map, so the card and its pin match. */
  color: string;
  onColor: string;
  onOpen: () => void;
  /** Absent when nothing nearby fits, so the card offers no change it cannot make. */
  onSwap?: () => void;
}) {
  const yours = stop.source === "save";
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.number, { backgroundColor: color }]}>
          <ThemedText variant="badge" style={{ color: onColor }}>
            {number}
          </ThemedText>
        </View>
        <ThemedText variant="captionStrong" style={styles.slot}>
          {slot.toLocaleUpperCase()}
        </ThemedText>
        <View style={[styles.badge, yours && styles.badgeYours]}>
          <ThemedText
            variant="captionStrong"
            style={yours ? styles.badgeYoursText : styles.muted}
          >
            {t(stopBadge(stop.source))}
          </ThemedText>
        </View>
      </View>
      <ThemedText variant="header" numberOfLines={2}>
        {stop.name}
      </ThemedText>
      {stop.area ? (
        <ThemedText variant="footnote" numberOfLines={1} style={styles.muted}>
          {stop.area}
        </ThemedText>
      ) : null}
      {stop.why ? (
        <ThemedText variant="footnote" numberOfLines={2}>
          {stop.why}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <CardAction
          icon="info.circle"
          label={t("datePlan.hours")}
          accessibilityLabel={t("datePlan.hoursFor", { name: stop.name })}
          onPress={onOpen}
        />
        {onSwap ? (
          <CardAction
            icon="arrow.2.circlepath"
            label={t("datePlan.change")}
            accessibilityLabel={t("datePlan.changeFor", { name: stop.name })}
            onPress={onSwap}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(0.75),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  top: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  number: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  slot: { flex: 1, color: theme.colors.muted, letterSpacing: 0.6 },
  badge: {
    paddingHorizontal: theme.gap(1),
    paddingVertical: theme.gap(0.25),
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  badgeYours: { backgroundColor: theme.colors.primarySoft },
  badgeYoursText: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
    paddingTop: theme.gap(0.75),
  },
  action: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
  },
  actionText: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
