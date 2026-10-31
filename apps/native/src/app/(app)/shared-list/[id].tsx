import { CityMap } from "@/components/city/city-map";
import { CitySheet, moveSheet } from "@/components/city/city-sheet";
import { PlanButton } from "@/components/city/plan-button";
import { EmptyState } from "@/components/empty-state";
import { ListPlaceRow } from "@/components/shared-list/list-place-row";
import { ListFooter } from "@/components/shared-list/list-footer";
import { ListHeaderRight } from "@/components/shared-list/list-header-right";
import { Chip } from "@/components/trip-planner/chip";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import {
  canOpenPlaceCard,
  cancelPlaceDetails,
  openPlaceDetails,
} from "@/lib/apple-place-card";
import { sheetSnaps } from "@/lib/city-sheet";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  defaultListCity,
  type ListRow,
  listPlaceAction,
  listRows,
  partnerName,
  type SharedListDetail,
  useListPlan,
  withLine,
} from "@/lib/shared-lists";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useNavigationState } from "expo-router/react-navigation";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  View,
} from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.4;

type Row =
  | { kind: "heading"; id: string; label: string; fresh: boolean }
  | { kind: "place"; id: string; row: ListRow };

function sectionRows(
  fresh: ListRow[],
  rest: ListRow[],
  partner: string,
): Row[] {
  if (fresh.length === 0) {
    return rest.map((row) => ({ kind: "place", id: row.pin.itemId, row }));
  }
  return [
    {
      kind: "heading",
      id: "fresh",
      label: t("sharedLists.newFrom", { name: partner }),
      fresh: true,
    },
    ...fresh.map((row): Row => ({ kind: "place", id: row.pin.itemId, row })),
    ...(rest.length > 0
      ? [
          {
            kind: "heading" as const,
            id: "rest",
            label: t("sharedLists.everythingElse"),
            fresh: false,
          },
        ]
      : []),
    ...rest.map((row): Row => ({ kind: "place", id: row.pin.itemId, row })),
  ];
}

function useSeenOnLeave(listId: Id<"sharedLists">, loaded: boolean) {
  const markSeen = useMutation(api.sharedLists.markSharedListSeen);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        cancelPlaceDetails();
        if (loaded) {
          markSeen({ listId }).catch((error: unknown) =>
            analytics.captureError("shared_list_seen_failed", error),
          );
        }
      };
    }, [listId, loaded, markSeen]),
  );
  return focused;
}

function usePlaceEdits() {
  const setVisited = useMutation(api.sharedLists.setSharedListPlaceVisited);
  const remove = useMutation(api.sharedLists.removeSharedListPlace);
  const report = (error: unknown) => {
    analytics.captureError("shared_list_edit_failed", error);
    Alert.alert(t("sharedLists.failed"));
  };
  return {
    visited: (placeId: Id<"sharedListPlaces">, visited: boolean) =>
      setVisited({ placeId, visited }).catch(report),
    remove: (placeId: Id<"sharedListPlaces">) =>
      remove({ placeId }).catch(report),
  };
}

export default function SharedListScreen() {
  useAppLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = id as Id<"sharedLists">;
  const detail = useQuery(
    convexQuery(api.sharedLists.getSharedList, { listId }),
  );
  const focused = useSeenOnLeave(listId, detail.data != null);
  const { theme } = useUnistyles();
  const stranded = useNavigationState((state) => state.index === 0);
  const goHome = () => backOrHome(router);
  const backTitle = (
    <>
      <Stack.Screen
        options={{
          headerBackTitle: t("common.back"),
          ...(stranded && Platform.OS !== "ios"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="chevron.left"
                    label={t("common.back")}
                    onPress={goHome}
                  />
                ),
              }
            : {}),
        }}
      />
      {stranded && Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="chevron.left"
            tintColor={theme.colors.foreground}
            onPress={goHome}
          >
            {t("common.back")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );
  if (detail.isError) {
    return (
      <>
        {backTitle}
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      </>
    );
  }
  if (detail.data === undefined) {
    return (
      <>
        {backTitle}
        <ScreenLoader />
      </>
    );
  }
  if (detail.data === null) {
    return (
      <View style={styles.container}>
        {backTitle}
        <EmptyState
          title={t("sharedLists.goneTitle")}
          message={t("sharedLists.goneBody")}
        />
        <View style={styles.gone}>
          <Button
            title={t("sharedLists.backHome")}
            onPress={() => backOrHome(router)}
          />
        </View>
      </View>
    );
  }
  return (
    <>
      {backTitle}
      <SharedList detail={detail.data} focused={focused} />
    </>
  );
}

function SharedList({
  detail,
  focused,
}: {
  detail: SharedListDetail;
  focused: React.RefObject<boolean>;
}) {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const [picked, setPicked] = useState<string | null>(null);
  const city =
    detail.cities.length > 1
      ? (picked ?? defaultListCity(detail.cities))
      : defaultListCity(detail.cities);
  const partner = partnerName(detail.members);
  const { fresh, rest } = useMemo(
    () => listRows(detail.places, city),
    [detail.places, city],
  );
  const rows = useMemo(
    () => sectionRows(fresh, rest, partner),
    [fresh, rest, partner],
  );
  const pins = useMemo(
    () => [...fresh, ...rest].map((row) => row.pin),
    [fresh, rest],
  );
  const canTrip = [...fresh, ...rest].some(
    (row) => row.place.visitedAt === undefined,
  );
  const edits = usePlaceEdits();
  const plan = useListPlan(detail._id, city);
  const list = useRef<FlatList<Row>>(null);
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
  const hasMap = pins.length > 0;
  const restingSnaps = useMemo(
    () =>
      hasMap
        ? snaps
        : { ...snaps, middle: snaps.expanded, collapsed: snaps.expanded },
    [hasMap, snaps],
  );
  const sheetTop = useSharedValue(restingSnaps.middle);
  const restingMiddle = restingSnaps.middle;
  useEffect(() => {
    sheetTop.set(restingMiddle);
  }, [restingMiddle, sheetTop]);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    analytics.capture("shared_list_opened", {
      places: detail.placeCount,
      members: detail.members.length,
      fresh: detail.places.filter((place) => place.isNew).length,
    });
  }, [detail]);

  const select = (pinId: string) => {
    setSelected(pinId);
    if (sheetTop.get() > snaps.middle) moveSheet(sheetTop, snaps.middle);
    const index = rows.findIndex((row) => row.id === pinId);
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.3 });
  };
  const open = (row: ListRow) => {
    if (!focused.current) return;
    const action = listPlaceAction(
      row.place,
      canOpenPlaceCard(row.place.appleId),
    );
    analytics.capture("shared_list_place_opened", { action: action.kind });
    switch (action.kind) {
      case "save":
        router.push({ pathname: "/item/[id]", params: { id: action.itemId } });
        return;
      case "card":
        void openPlaceDetails(action.appleId, () => {
          if (!focused.current) return;
          const fallback = listPlaceAction(row.place, false);
          if (fallback.kind === "maps") {
            Linking.openURL(fallback.url).catch((error: unknown) =>
              analytics.captureError("shared_list_maps_failed", error),
            );
          }
        });
        return;
      case "maps":
        Linking.openURL(action.url).catch((error: unknown) =>
          analytics.captureError("shared_list_maps_failed", error),
        );
    }
  };

  return (
    <View style={styles.container}>
      <ListHeaderRight detail={detail} />
      {hasMap ? (
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
            <View style={styles.titleRow}>
              <ThemedText
                variant="largeTitle"
                numberOfLines={2}
                style={styles.name}
              >
                {detail.name}
              </ThemedText>
              <ThemedText variant="footnote" style={styles.muted}>
                {t("homePlaces.spotCount", { count: detail.placeCount })}
              </ThemedText>
            </View>
            <ThemedText variant="footnote" style={styles.muted}>
              {[detail.cities.join(", "), withLine(detail.members)]
                .filter(Boolean)
                .join(" · ")}
            </ThemedText>
            {detail.cities.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {detail.cities.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={option === city}
                    pick="radio"
                    fill={{
                      background: theme.colors.primary,
                      foreground: theme.colors.onTint,
                    }}
                    onPress={() => {
                      setSelected(null);
                      setPicked(option);
                    }}
                  />
                ))}
              </ScrollView>
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
            renderItem={({ item }) =>
              item.kind === "heading" ? (
                <ThemedText
                  variant="captionStrong"
                  style={[styles.section, item.fresh && styles.freshLabel]}
                >
                  {item.label}
                </ThemedText>
              ) : (
                <ListPlaceRow
                  place={item.row.place}
                  number={item.row.pin.number}
                  selected={selected === item.id}
                  onPress={() =>
                    selected === item.id ? open(item.row) : select(item.id)
                  }
                  onPlaceDetails={
                    canOpenPlaceCard(item.row.place.appleId)
                      ? () => open(item.row)
                      : undefined
                  }
                  onVisited={(visited) =>
                    void edits.visited(item.row.place._id, visited)
                  }
                  onRemove={() => {
                    setSelected(null);
                    void edits.remove(item.row.place._id);
                  }}
                />
              )
            }
            ListEmptyComponent={
              <EmptyState
                title={t("sharedLists.emptyTitle")}
                message={t("sharedLists.emptyBody")}
              />
            }
            ListFooterComponent={<ListFooter detail={detail} city={city} />}
          />
        )}
      />
      {city !== null && hasMap ? (
        <View
          style={styles.plans}
          onLayout={(event) => setPlansHeight(event.nativeEvent.layout.height)}
        >
          <PlanButton kind="date" busy={null} onPress={() => plan("date")} />
          {canTrip ? (
            <PlanButton kind="trip" busy={null} onPress={() => plan("trip")} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  map: { ...StyleSheet.absoluteFillObject },
  gone: {
    paddingHorizontal: theme.gap(3),
    paddingBottom: rt.insets.bottom + theme.gap(3),
  },
  content: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(12),
  },
  header: {
    gap: theme.gap(0.5),
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(1.5),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
  },
  name: { flexShrink: 1 },
  muted: { color: theme.colors.muted },
  chips: { gap: theme.gap(1), paddingTop: theme.gap(1) },
  section: {
    color: theme.colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingTop: theme.gap(1),
  },
  freshLabel: { color: theme.colors.primaryText },
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
}));
