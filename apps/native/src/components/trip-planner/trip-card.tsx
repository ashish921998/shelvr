import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { tripLengthLine, tripStopsLine, tripTitle } from "@/lib/trip-planner";
import type { TripPlanSummary } from "@convex/model/tripPlan";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  trip: TripPlanSummary;
  onOpen: () => void;
  onDelete: () => void;
};

export function TripCard({ trip, onOpen, onDelete }: Props) {
  const { theme } = useUnistyles();
  const title = tripTitle(trip.city);
  const length = tripLengthLine(trip);
  const stops = tripStopsLine(trip);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${length}, ${stops}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <AppSymbolIcon
            name="airplane"
            size={18}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <View style={styles.text}>
          <ThemedText variant="title" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText variant="subhead" style={styles.muted} numberOfLines={1}>
            {length}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
            {stops}
          </ThemedText>
        </View>
      </Pressable>
      <ActionMenu
        label={t("tripPlanner.tripActions")}
        title={title}
        actions={[
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(2),
  },
  pressed: { opacity: theme.opacity.pressed },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  menu: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    marginRight: theme.gap(0.5),
    alignItems: "center",
    justifyContent: "center",
  },
}));
