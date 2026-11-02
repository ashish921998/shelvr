import { PlaceMapScreen } from "@/components/city/place-map-screen";
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
import { canOpenPlaceCard } from "@/lib/apple-place-card";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { stopAction } from "@/lib/trip-planner";
import {
  type ListRow,
  listRows,
  listSectionRows,
  partnerName,
  type SharedListDetail,
  type SharedListPlace,
  useListPlan,
  withLine,
} from "@/lib/shared-lists";
import { usePlaceOpener } from "@/lib/use-place-opener";
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
import { Alert, Platform, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function useSeenOnLeave(listId: Id<"sharedLists">, loaded: boolean) {
  const markSeen = useMutation(api.sharedLists.markSharedListSeen);
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (loaded) {
          markSeen({ listId }).catch((error: unknown) =>
            analytics.captureError("shared_list_seen_failed", error),
          );
        }
      };
    }, [listId, loaded, markSeen]),
  );
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
  useSeenOnLeave(listId, detail.data != null);
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
      <SharedList detail={detail.data} />
    </>
  );
}

function SharedList({ detail }: { detail: SharedListDetail }) {
  const { theme } = useUnistyles();
  const [picked, setPicked] = useState<string | null>(null);
  const city =
    picked !== null && detail.cities.includes(picked)
      ? picked
      : (detail.cities[0] ?? "");
  const partner = partnerName(detail.members);
  const places = useMemo(
    () => listRows(detail.places, city),
    [detail.places, city],
  );
  const rows = useMemo(
    () => listSectionRows(places, partner),
    [places, partner],
  );
  const pins = useMemo(() => places.map((row) => row.pin), [places]);
  const canTrip = places.some((row) => row.place.visitedAt === undefined);
  const edits = usePlaceEdits();
  const plan = useListPlan(detail._id, city);
  const [selected, setSelected] = useState<string | null>(null);
  const hasMap = pins.length > 0;
  const opener = usePlaceOpener<SharedListPlace>(
    stopAction,
    "shared_list_maps_failed",
  );

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

  const open = (row: ListRow) => {
    if (!opener.focused.current) return;
    const action = stopAction(row.place, canOpenPlaceCard(row.place.appleId));
    analytics.capture("shared_list_place_opened", { action: action.kind });
    opener.open(row.place, action);
  };

  return (
    <>
      <ListHeaderRight detail={detail} />
      <PlaceMapScreen
        pins={pins}
        hasMap={hasMap}
        rows={rows}
        rowGap={1}
        selected={selected}
        onSelect={setSelected}
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
        renderRow={(item, select) =>
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
        empty={
          <EmptyState
            title={t("sharedLists.emptyTitle")}
            message={t("sharedLists.emptyBody")}
          />
        }
        footer={<ListFooter detail={detail} city={city} />}
        plans={
          hasMap ? (
            <>
              <PlanButton
                kind="date"
                busy={null}
                onPress={() => plan("date")}
              />
              {canTrip ? (
                <PlanButton
                  kind="trip"
                  busy={null}
                  onPress={() => plan("trip")}
                />
              ) : null}
            </>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  gone: {
    paddingHorizontal: theme.gap(3),
    paddingBottom: rt.insets.bottom + theme.gap(3),
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
}));
