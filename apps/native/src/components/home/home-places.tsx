import { CityCover } from "@/components/city/city-cover";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { type City, visibleCities } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const CITY_HEIGHT = 150;

function CityGrid({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleCities(cities, expanded);
  return (
    <View style={styles.grid}>
      {shown.map((entry) => (
        <Pressable
          key={entry.city}
          accessibilityRole="button"
          accessibilityLabel={`${entry.city}, ${t("homePlaces.spotCount", { count: entry.count })}`}
          onPress={() =>
            router.push({
              pathname: "/city/[name]",
              params: { name: entry.city },
            })
          }
          style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
        >
          <CityCover {...entry} height={CITY_HEIGHT} />
        </Pressable>
      ))}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("homePlaces.moreCities", { n: String(hidden) })}
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [
            styles.cell,
            styles.more,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.moreLabel}>
            {t("homePlaces.moreCities", { n: String(hidden) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The places pitch for an empty shelf; Home shows it before the first save. */
export function HomePlacesEmptyCard() {
  const router = useRouter();
  const { guard } = usePaywallGuard("home");
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("homePlaces.emptyTitle")}</Text>
      <Text style={styles.muted}>{t("homePlaces.emptyBody")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("homePlaces.addSpot")}
        onPress={() => void guard(() => router.push("/add"))}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonLabel}>{t("homePlaces.addSpot")}</Text>
      </Pressable>
    </View>
  );
}

export function HomePlaces() {
  useAppLocale();
  const { entitled } = useEntitlement();
  const cities = useQuery(
    convexQuery(api.items.listCities, entitled ? {} : "skip"),
  );
  if (!entitled || cities.data === undefined) return null;
  if (cities.data.length === 0) {
    return (
      <View style={styles.container}>
        <HomePlacesEmptyCard />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("homePlaces.yourCities")}</Text>
      <Text style={styles.muted}>{t("homePlaces.citiesHint")}</Text>
      <CityGrid cities={cities.data} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  title: { ...theme.type.title, color: theme.colors.foreground },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.gap(1.5) },
  cell: { width: "100%" },
  pressed: { opacity: theme.opacity.pressed },
  more: {
    height: CITY_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  moreLabel: { ...theme.type.subheadStrong, color: theme.colors.foreground },

  muted: { ...theme.type.footnote, color: theme.colors.muted },
  card: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: { ...theme.type.title, color: theme.colors.foreground },
  button: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(3),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  buttonLabel: { ...theme.type.button, color: theme.colors.surface },
}));
