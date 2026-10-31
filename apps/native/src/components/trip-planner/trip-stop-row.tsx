import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { stopBadge, stopRowLabel, stopWhyLine } from "@/lib/trip-planner";
import type { TripPlanStop } from "@convex/model/tripPlan";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  stop: TripPlanStop;
  /** The stop's place in its day; unplanned stops have none. */
  number?: number;
  /** The stop's `why` is the title of a save several stops come from, so it reads "From …". */
  fromSave?: boolean;
  /** Its day's colour for the number badge, matching the day's pins and route on the map. */
  dayColor?: { color: string; on: string };
  onPress: () => void;
};

export function TripStopRow({
  stop,
  number,
  fromSave,
  dayColor,
  onPress,
}: Props) {
  const badge = t(stopBadge(stop.source));
  const yours = stop.source === "save";
  const why = stopWhyLine(stop, fromSave === true);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={stopRowLabel(stop, {
        number,
        fromSave: fromSave === true,
      })}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {number !== undefined ? (
        <View
          style={[
            styles.number,
            dayColor && { backgroundColor: dayColor.color },
          ]}
        >
          <ThemedText
            variant="badge"
            style={[styles.numberText, dayColor && { color: dayColor.on }]}
          >
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
          <View style={[styles.badge, yours && styles.badgeYours]}>
            <ThemedText
              variant="captionStrong"
              style={yours ? styles.badgeYoursText : styles.badgeText}
            >
              {badge}
            </ThemedText>
          </View>
        </View>
        {stop.area ? (
          <ThemedText variant="footnote" numberOfLines={1} style={styles.muted}>
            {stop.area}
          </ThemedText>
        ) : null}
        {why !== null && fromSave ? (
          <ThemedText variant="footnote" numberOfLines={2} style={styles.muted}>
            {why}
          </ThemedText>
        ) : why !== null ? (
          <ThemedText variant="footnote" numberOfLines={3}>
            {why}
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
