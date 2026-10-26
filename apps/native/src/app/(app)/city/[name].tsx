import { CityMap } from "@/components/city/city-map";
import { SaveRow } from "@/components/city/save-row";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { cityPins, cityRows } from "@/lib/city-pins";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GooglePlaceCard } from "../../../../modules/place-card";

const MAP_SHARE = 0.4;

function PlanButton({
  kind,
  busy,
  onPress,
}: {
  kind: CityPlanKind;
  busy: CityPlanKind | null;
  onPress: () => void;
}) {
  const label = t(
    kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip",
  );
  const hint = t(
    kind === "date" ? "homePlaces.planDateHint" : "homePlaces.planTripHint",
  );
  const dark = kind === "date";
  const working = busy === kind;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy !== null, busy: working }}
      disabled={busy !== null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planButton,
        dark ? styles.planDark : styles.planMuted,
        (pressed || (busy !== null && !working)) && styles.pressed,
      ]}
    >
      {working ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={[styles.planLabel, dark && styles.onDark]}>{label}</Text>
          <Text style={[styles.planHint, dark && styles.onDark]}>{hint}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function CityScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const { name } = useLocalSearchParams<{ name: string }>();
  const city = name ?? "";
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const { busy, start } = useCityPlan(city);
  const list = useRef<FlatList>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const loaded = items.data !== undefined;
  const count = items.data?.length ?? 0;

  const opened = useRef(false);
  useEffect(() => {
    if (!loaded || opened.current) return;
    opened.current = true;
    analytics.capture("city_opened", { count });
  }, [loaded, count]);

  // Stable while the query data is, so the map keeps the camera the person moved.
  const pins = useMemo(() => cityPins(items.data ?? []), [items.data]);
  const rows = useMemo(
    () => cityRows(items.data ?? [], pins),
    [items.data, pins],
  );

  if (items.isError) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (items.data === undefined) return <ScreenLoader />;

  const mapHeight = rt.screen.height * MAP_SHARE;

  const select = (id: string) => {
    setSelected(id);
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) {
      list.current?.scrollToIndex({ index, viewPosition: 0.3 });
    }
  };

  return (
    <View style={styles.container}>
      {pins.length > 0 ? (
        <View style={[styles.map, { height: mapHeight }]}>
          <CityMap
            pins={pins}
            selected={selected}
            height={mapHeight}
            onSelect={select}
          />
        </View>
      ) : null}
      <View
        style={[
          styles.sheet,
          pins.length > 0 ? { marginTop: mapHeight - theme.gap(3) } : null,
        ]}
      >
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(row) => row.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          onScrollToIndexFailed={(info) =>
            list.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
            })
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.name} numberOfLines={2}>
                {city}
              </Text>
              {pins.length > 0 ? (
                <Text style={styles.count}>
                  {t("cityMap.placesFromSaves", { count: pins.length })}
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item: row }) => {
            const { item } = row;
            const pin = row.kind === "place" ? row.pin : undefined;
            return (
              <View>
                <SaveRow
                  item={item}
                  placeName={row.kind === "place" ? row.name : undefined}
                  number={row.kind === "place" ? row.number : undefined}
                  selected={selected === row.id}
                  // First select the place's pin; a second tap opens its source save.
                  onPress={
                    row.kind === "place" && selected !== row.id
                      ? () => select(row.id)
                      : () =>
                          router.push({
                            pathname: "/item/[id]",
                            params: { id: item._id },
                          })
                  }
                />
                {pin ? (
                  <GooglePlaceCard
                    key={row.id}
                    placeName={pin.name}
                    city={city}
                    latitude={pin.lat}
                    longitude={pin.lng}
                  />
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title={t("homePlaces.emptyTitle")}
              message={t("homePlaces.emptyBody")}
            />
          }
        />
      </View>
      {count > 0 ? (
        <View style={styles.plans}>
          <PlanButton
            kind="date"
            busy={busy}
            onPress={() => void start("date")}
          />
          <PlanButton
            kind="trip"
            busy={busy}
            onPress={() => void start("trip")}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  map: { position: "absolute", top: 0, left: 0, right: 0 },
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    // Clears the plan bar pinned below.
    paddingBottom: rt.insets.bottom + theme.gap(12),
  },
  header: {
    gap: theme.gap(0.25),
    paddingTop: theme.gap(2.5),
    paddingBottom: theme.gap(1),
  },
  name: { ...theme.type.largeTitle, color: theme.colors.foreground },
  count: { ...theme.type.footnote, color: theme.colors.muted },
  plans: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1),
    backgroundColor: theme.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  planButton: {
    flex: 1,
    minHeight: theme.control.minHeight,
    gap: theme.gap(0.25),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  planDark: { backgroundColor: theme.colors.foreground },
  planMuted: { backgroundColor: theme.colors.surfaceMuted },
  planLabel: { ...theme.type.button, color: theme.colors.foreground },
  planHint: { ...theme.type.caption, color: theme.colors.muted },
  onDark: { color: theme.colors.surface },
  pressed: { opacity: theme.opacity.pressed },
}));
