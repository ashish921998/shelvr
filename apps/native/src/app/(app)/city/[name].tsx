import { CityMap } from "@/components/city/city-map";
import { CitySheet, moveSheet } from "@/components/city/city-sheet";
import { SaveRow } from "@/components/city/save-row";
import { EmptyState } from "@/components/empty-state";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { cityPins, cityRows } from "@/lib/city-pins";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { sheetSnaps } from "@/lib/city-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
  // A place card's Apple lookup can finish after the user has left; it must not present or navigate then.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        cancelPlaceDetails();
      };
    }, []),
  );
  const city = name ?? "";
  const items = useQuery(convexQuery(api.items.listCityItems, { city }));
  const { busy, start } = useCityPlan(city);
  const list = useRef<FlatList>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { height: screenHeight } = rt.screen;
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [plansHeight, setPlansHeight] = useState<number | null>(null);
  const snaps = useMemo(
    () =>
      sheetSnaps({
        height: screenHeight,
        insetTop: rt.insets.top,
        insetBottom: rt.insets.bottom,
        middle: screenHeight * MAP_SHARE - theme.gap(3),
        ...(headerHeight !== null && plansHeight !== null
          ? { collapsedVisible: headerHeight + plansHeight - rt.insets.bottom }
          : {}),
      }),
    [screenHeight, rt.insets, theme, headerHeight, plansHeight],
  );
  const sheetTop = useSharedValue(snaps.middle);
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
  const hasMap = pins.length > 0;
  // With no map behind it, the list stays open and does not drag.
  const restingSnaps = useMemo(
    () =>
      hasMap
        ? snaps
        : { ...snaps, middle: snaps.expanded, collapsed: snaps.expanded },
    [hasMap, snaps],
  );
  // A number, not the snaps object, so a re-render never pulls a dragged sheet back.
  const restingMiddle = restingSnaps.middle;
  useEffect(() => {
    if (loaded) sheetTop.set(restingMiddle);
  }, [loaded, restingMiddle, sheetTop]);
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

  const select = (id: string) => {
    setSelected(id);
    // A pin tapped with the list pulled down brings its row back into view.
    if (sheetTop.get() > snaps.middle) moveSheet(sheetTop, snaps.middle);
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) {
      list.current?.scrollToIndex({ index, viewPosition: 0.3 });
    }
  };

  return (
    <View style={styles.container}>
      {pins.length > 0 ? (
        <View style={styles.map}>
          <CityMap
            pins={pins}
            selected={selected}
            height={screenHeight}
            coveredBottom={screenHeight - snaps.middle}
            onSelect={select}
          />
        </View>
      ) : null}
      <CitySheet
        snaps={restingSnaps}
        onHeaderHeight={setHeaderHeight}
        top={sheetTop}
        header={
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
        list={(scroll) => (
          <Animated.FlatList
            ref={list}
            scrollEnabled={scroll.scrollEnabled}
            onScroll={scroll.onScroll}
            scrollEventThrottle={16}
            bounces={scroll.bounces}
            data={rows}
            keyExtractor={(row) => row.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
            onScrollToIndexFailed={(info) =>
              list.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
              })
            }
            renderItem={({ item: row }) => {
              const { item } = row;
              const appleId =
                row.kind === "place" ? row.pin.appleId : undefined;
              const openSave = () => {
                if (!focused.current) return;
                router.push({
                  pathname: "/item/[id]",
                  params: { id: item._id },
                });
              };
              return (
                <SaveRow
                  item={item}
                  placeName={row.kind === "place" ? row.name : undefined}
                  number={row.kind === "place" ? row.number : undefined}
                  selected={selected === row.id}
                  // First select the place's pin; a second tap opens its source save.
                  onPress={
                    row.kind === "place" && selected !== row.id
                      ? () => select(row.id)
                      : openSave
                  }
                  onPlaceDetails={
                    appleId !== undefined && canOpenPlaceCard(appleId)
                      ? () => void openPlaceDetails(appleId, openSave)
                      : undefined
                  }
                />
              );
            }}
            ListEmptyComponent={
              <EmptyState
                title={t("homePlaces.emptyTitle")}
                message={t("homePlaces.emptyBody")}
              />
            }
          />
        )}
      />
      {count > 0 ? (
        <View
          style={styles.plans}
          onLayout={(event) => setPlansHeight(event.nativeEvent.layout.height)}
        >
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
  map: { ...StyleSheet.absoluteFillObject },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    // Clears the plan bar pinned below.
    paddingBottom: rt.insets.bottom + theme.gap(12),
  },
  header: {
    gap: theme.gap(0.25),
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(1.5),
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
