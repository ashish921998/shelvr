import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import {
  countryFlag,
  tripCardDate,
  tripCountryLine,
  tripCoverUri,
  tripInterestsLine,
  tripName,
} from "@/lib/trip-planner";
import type { TripPlanSummary } from "@convex/model/tripPlan";
import { Image } from "expo-image";
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
    trip.countries
      ? tripCountryLine(trip.countries)
      : trip.name?.trim()
        ? trip.city
        : null,
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
        {trip.cover ? (
          <Image source={tripCoverUri(trip.cover)} style={styles.cover} />
        ) : trip.countries?.[0] ? (
          <View style={styles.cover}>
            <ThemedText variant="title">
              {countryFlag(trip.countries[0])}
            </ThemedText>
          </View>
        ) : null}
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
  cover: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
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
    paddingVertical: theme.gap(1.75),
    paddingLeft: theme.gap(2),
  },
  pressed: { opacity: theme.opacity.pressed },
  text: { flex: 1, gap: theme.gap(0.5) },
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
