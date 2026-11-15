import { EmptyState } from "@/components/empty-state";
import { ScreenTitle } from "@/components/screen-title";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { canBrowse } from "@/lib/access";
import { analytics } from "@/lib/analytics";
import { curatedCityPicture } from "@/lib/city-picture";
import { useAccess } from "@/lib/free-plan";
import { type City, cityCountLine } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useReportLoadFailure } from "@/lib/use-report-load-failure";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const SIDE = 20;
const GAP = 12;

function CityPhoto({ entry }: { entry: City }) {
  const [failed, setFailed] = useState<readonly (string | number)[]>([]);
  const savePhoto = entry.cover === entry.photo ? null : entry.cover;
  const source = [
    savePhoto,
    curatedCityPicture(entry.city),
    entry.photo ?? entry.cover,
  ].find(
    (candidate): candidate is string | number =>
      !!candidate && !failed.includes(candidate),
  );
  if (source === undefined) return <View style={styles.photo} />;
  return (
    <Image
      testID="city-cover-photo"
      source={typeof source === "number" ? source : { uri: source }}
      style={styles.photo}
      contentFit="cover"
      recyclingKey={entry.city}
      onError={() => {
        analytics.captureError(
          "city_cover_image_failed",
          new Error("image_load_failed"),
          { curated: typeof source === "number" },
        );
        setFailed((seen) => [...seen, source]);
      }}
    />
  );
}

function CityTile({ entry, width }: { entry: City; width: number }) {
  const router = useRouter();
  const count = cityCountLine(entry);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${entry.city}, ${count}` : entry.city}
      onPress={() =>
        router.push({ pathname: "/city/[name]", params: { name: entry.city } })
      }
      style={({ pressed }) => [
        styles.tile,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <CityPhoto entry={entry} />
      <View style={styles.text}>
        <ThemedText variant="bodyLabel" style={styles.name} numberOfLines={1}>
          {entry.city}
        </ThemedText>
        {count ? (
          <ThemedText style={styles.count} numberOfLines={1}>
            {count}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

export function Cities() {
  useAppLocale();
  const { width } = useWindowDimensions();
  const browsing = canBrowse(useAccess());
  const cities = useQuery(
    convexQuery(api.items.listCities, browsing ? {} : "skip"),
  );
  useReportLoadFailure("cities_load_failed", cities);
  const tile = (width - SIDE * 2 - GAP) / 2;
  let body = <ScreenLoader />;
  if (cities.data !== undefined) {
    body = (
      <ScrollView contentContainerStyle={styles.grid}>
        {cities.data.map((entry) => (
          <CityTile key={entry.city} entry={entry} width={tile} />
        ))}
      </ScrollView>
    );
  } else if (cities.isError) {
    body = (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("homePlaces.cities")} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: GAP,
    rowGap: theme.gap(2.5),
    paddingHorizontal: SIDE,
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  tile: { gap: 7 },
  pressed: { opacity: theme.opacity.pressed },
  photo: {
    width: "100%",
    height: 172,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  text: { gap: 1 },
  name: { fontSize: 16.5, lineHeight: 21 },
  count: { fontSize: 13.3, lineHeight: 17, color: theme.colors.muted },
}));
