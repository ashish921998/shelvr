import { CityCover } from "@/components/city/city-cover";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import {
  type City,
  spacesWithoutCities,
  visibleCities,
} from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const CITY_HEIGHT = 120;

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

type SpaceEntry = {
  _id: Id<"spaces">;
  name: string;
  itemCount: number;
  previews: { url: string }[];
};

function SpaceRow({ space }: { space: SpaceEntry }) {
  const router = useRouter();
  const thumb = space.previews[0]?.url;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={space.name}
      onPress={() =>
        router.push({ pathname: "/space/[id]", params: { id: space._id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={styles.thumb}
          contentFit="cover"
        />
      ) : (
        <View style={styles.thumb} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {space.name}
        </Text>
        <Text style={styles.muted}>
          {t("spaces.saveCount", { count: space.itemCount })}
        </Text>
      </View>
    </Pressable>
  );
}

function SpaceList({ spaces }: { spaces: SpaceEntry[] }) {
  const router = useRouter();
  if (spaces.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t("homePlaces.yourSpaces")}</Text>
      {spaces.map((space) => (
        <SpaceRow key={space._id} space={space} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("homePlaces.seeAll")}
        onPress={() => router.push("/(app)/(tabs)/(spaces)")}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.seeAll}>{t("homePlaces.seeAll")}</Text>
      </Pressable>
    </View>
  );
}

function EmptyCard() {
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
  const spaces = useQuery(
    convexQuery(api.spaces.listSpaces, entitled ? {} : "skip"),
  );
  if (!entitled || cities.data === undefined || spaces.data === undefined) {
    return null;
  }
  if (cities.data.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyCard />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>{t("homePlaces.yourCities")}</Text>
        <CityGrid cities={cities.data} />
      </View>
      <SpaceList spaces={spacesWithoutCities(spaces.data, cities.data)} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(2.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  section: { gap: theme.gap(1.5) },
  label: {
    ...theme.type.labelStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.gap(1.5) },
  cell: { width: "47.5%", flexGrow: 1 },
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
  row: { flexDirection: "row", alignItems: "center", gap: theme.gap(1.5) },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowText: { flex: 1, gap: theme.gap(0.25) },
  rowTitle: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  muted: { ...theme.type.footnote, color: theme.colors.muted },
  seeAll: { ...theme.type.subheadLabel, color: theme.colors.primaryText },
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
