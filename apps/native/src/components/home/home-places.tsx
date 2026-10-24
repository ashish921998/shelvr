import { CityCover } from "@/components/city/city-cover";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { type City, unplacedSaves, visibleCities } from "@/lib/home-places";
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

const MAX_UNPLACED_ROWS = 5;

type UnplacedSave = {
  _id: string;
  status: "processing" | "ready" | "failed";
  cities?: string[];
  title?: string;
  url?: string;
};

function unplacedLabel(save: UnplacedSave): string {
  if (save.status === "processing") return t("homePlaces.noPlaceReading");
  if (save.status === "failed") return t("homePlaces.noPlaceFailed");
  return t("homePlaces.noPlaceNone");
}

/** Saves no city card shows, so nothing shared disappears; each opens its save to retry or delete. */
export function UnplacedSaves({ saves }: { saves: UnplacedSave[] }) {
  useAppLocale();
  const router = useRouter();
  const unplaced = unplacedSaves(saves).slice(0, MAX_UNPLACED_ROWS);
  if (unplaced.length === 0) return null;
  return (
    <View style={styles.unplaced}>
      <Text style={styles.sectionLabel}>{t("homePlaces.noPlaceTitle")}</Text>
      {unplaced.map((save) => (
        <Pressable
          key={save._id}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/item/[id]",
              params: { id: save._id, from: "home" },
            })
          }
          style={({ pressed }) => [
            styles.unplacedRow,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.unplacedTitle} numberOfLines={1}>
            {save.title ?? save.url ?? ""}
          </Text>
          <Text style={styles.muted}>{unplacedLabel(save)}</Text>
        </Pressable>
      ))}
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
  unplaced: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
  },
  sectionLabel: {
    ...theme.type.labelStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  unplacedRow: {
    gap: theme.gap(0.25),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  unplacedTitle: {
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
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
