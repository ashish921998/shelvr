import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { tripName } from "@/lib/trip-planner";
import { useTripToContinue } from "@/lib/use-trip-to-continue";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapTripPill({ city }: { city: string | undefined }) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const next = useTripToContinue(city);
  if (!next) return null;
  const name = tripName(next.trip);
  const onPress = () => {
    analytics.capture("map_trip_continued", { in_progress: next.inProgress });
    router.push({
      pathname: "/trip-plan/[id]",
      params: { id: next.trip._id },
    });
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("map.continueTrip", { name })}
      onPress={onPress}
      hitSlop={7}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name="suitcase.fill"
        size={15}
        tintColor={theme.colors.primaryText}
      />
      <ThemedText variant="labelStrong" numberOfLines={1} style={styles.name}>
        {name}
      </ThemedText>
      <AppSymbolIcon
        name="chevron.right"
        size={13}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    height: 34,
    maxWidth: "70%",
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.2)",
    marginBottom: 10,
  },
  name: { flexShrink: 1 },
  pressed: { opacity: theme.opacity.pressed },
}));
