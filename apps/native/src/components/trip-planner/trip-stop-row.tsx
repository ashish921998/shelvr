import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { stopBadge } from "@/lib/trip-planner";
import type { TripPlanStop } from "@convex/model/tripPlan";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  stop: TripPlanStop;
  /** The stop's place in its day; unplanned stops have none. */
  number?: number;
  onPress: () => void;
};

export function TripStopRow({ stop, number, onPress }: Props) {
  const badgeKey = stopBadge(stop.source);
  const badge = badgeKey === null ? null : t(badgeKey);
  const yours = stop.source === "save";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[stop.name, badge, stop.area]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {number !== undefined ? (
        <View style={styles.number}>
          <ThemedText variant="badge" style={styles.numberText}>
            {number}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.dot} />
      )}
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText
            variant="subheadStrong"
            numberOfLines={2}
            style={styles.name}
          >
            {stop.name}
          </ThemedText>
          {badge !== null ? (
            <View style={[styles.badge, yours && styles.badgeYours]}>
              <ThemedText
                variant="captionStrong"
                style={yours ? styles.badgeYoursText : styles.badgeText}
              >
                {badge}
              </ThemedText>
            </View>
          ) : null}
        </View>
        {stop.area ? (
          <ThemedText variant="footnote" numberOfLines={1} style={styles.muted}>
            {stop.area}
          </ThemedText>
        ) : null}
        {stop.why ? (
          <ThemedText variant="footnote" numberOfLines={3}>
            {stop.why}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  number: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  numberText: { color: theme.colors.onTint },
  dot: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  text: { flex: 1, gap: theme.gap(0.5) },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1),
  },
  name: { flex: 1 },
  badge: {
    paddingHorizontal: theme.gap(1),
    paddingVertical: theme.gap(0.25),
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  badgeYours: { backgroundColor: theme.colors.primarySoft },
  badgeText: { color: theme.colors.muted },
  badgeYoursText: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
}));
