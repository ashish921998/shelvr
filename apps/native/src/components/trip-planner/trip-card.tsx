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
    t("trip.dayCount", { count: trip.dayCount }),
    t("trip.stopCount", { count: trip.stopCount }),
  ].join(" · ");
  const destination = trip.countries
    ? tripCountryLine(trip.countries)
    : trip.name?.trim()
      ? trip.city
      : null;
  const date = tripCardDate(trip);
  const label = [title, summary, date, destination, tripInterestsLine(trip)]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.cover}>
          {trip.cover ? (
            <Image
              source={tripCoverUri(trip.cover)}
              style={styles.coverImage}
              contentFit="cover"
            />
          ) : (
            <>
              <View style={styles.coverCircle} />
              <View style={styles.coverBadge}>
                {trip.countries?.[0] ? (
                  <ThemedText variant="title">
                    {countryFlag(trip.countries[0])}
                  </ThemedText>
                ) : (
                  <AppSymbolIcon
                    name="map"
                    size={26}
                    tintColor={theme.colors.primaryText}
                  />
                )}
              </View>
            </>
          )}
        </View>
        <View style={styles.text}>
          <ThemedText variant="headline" numberOfLines={2}>
            {title}
          </ThemedText>
          <ThemedText variant="caption" style={styles.muted}>
            {summary}
          </ThemedText>
          <ThemedText variant="caption" style={styles.muted} numberOfLines={1}>
            {date}
          </ThemedText>
        </View>
      </Pressable>
      <View style={styles.menuPosition}>
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
          <View style={styles.menuBadge}>
            <AppSymbolIcon
              name="ellipsis"
              size={16}
              weight="semibold"
              tintColor={theme.colors.foreground}
            />
          </View>
        </ActionMenu>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  cover: {
    aspectRatio: 1.1,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: { ...StyleSheet.absoluteFillObject },
  coverCircle: {
    position: "absolute",
    width: "108%",
    aspectRatio: 1,
    top: "25%",
    left: "-16%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  coverBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    position: "relative",
  },
  body: {
    gap: theme.gap(0.75),
  },
  pressed: { opacity: theme.opacity.pressed },
  text: { gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  menuPosition: { position: "absolute", top: 0, right: 0 },
  menu: {
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  menuBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.frame,
    alignItems: "center",
    justifyContent: "center",
  },
}));
