import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { tripCardDate, tripInterestsLine, tripName } from "@/lib/trip-planner";
import type { TripPlanSummary } from "@convex/model/tripPlan";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  trip: TripPlanSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function TripCard({ trip, onOpen, onEdit, onDelete }: Props) {
  const { theme } = useUnistyles();
  const title = tripName(trip);
  const summary = [
    trip.name?.trim() ? trip.city : null,
    t("trip.dayCount", { count: trip.dayCount }),
    t("trip.stopCount", { count: trip.stopCount }),
  ]
    .filter(Boolean)
    .join(" · ");
  const context = [tripCardDate(trip), tripInterestsLine(trip)]
    .filter(Boolean)
    .join(" · ");
  const label = [title, summary, context].join(", ");
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.text}>
          <ThemedText variant="title" numberOfLines={2}>
            {title}
          </ThemedText>
          <ThemedText variant="subheadLabel" style={styles.summary}>
            {summary}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={2}>
            {context}
          </ThemedText>
        </View>
      </Pressable>
      <ActionMenu
        label={t("tripPlanner.tripActions")}
        title={title}
        actions={[
          {
            id: "edit",
            label: t("tripPlanner.edit"),
            onPress: onEdit,
          },
          {
            id: "delete",
            label: t("tripPlanner.delete"),
            destructive: true,
            onPress: onDelete,
          },
        ]}
        style={styles.menu}
      >
        <AppSymbolIcon
          name="ellipsis"
          size={18}
          weight="semibold"
          tintColor={theme.colors.muted}
        />
      </ActionMenu>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  body: {
    flex: 1,
    paddingVertical: theme.gap(1.75),
    paddingLeft: theme.gap(2),
  },
  pressed: { opacity: theme.opacity.pressed },
  text: { gap: theme.gap(0.5) },
  summary: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
  menu: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    marginHorizontal: theme.gap(0.5),
    alignItems: "center",
    justifyContent: "center",
  },
}));
