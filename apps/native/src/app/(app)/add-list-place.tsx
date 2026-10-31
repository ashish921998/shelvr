import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { openPaywall } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { inCity, type SharedListDetail } from "@/lib/shared-lists";
import { type PlaceSearch, usePlaceSearch } from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sameTripPlace } from "@convex/model/placeIdentity";
import type { TripPlace } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAX_QUERY_LENGTH = 100;

function PlaceRow({
  name,
  detail,
  added,
  disabled,
  onPress,
}: {
  name: string;
  detail: string | undefined;
  added: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, detail, added ? t("sharedLists.onList") : null]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.place, pressed && styles.pressed]}
    >
      <View style={styles.placeText}>
        <ThemedText variant="subheadStrong" numberOfLines={2}>
          {name}
        </ThemedText>
        {detail ? (
          <ThemedText variant="footnote" numberOfLines={1} style={styles.muted}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {added ? (
        <ThemedText variant="caption" style={styles.muted}>
          {t("sharedLists.onList")}
        </ThemedText>
      ) : (
        <AppSymbolIcon
          name="plus.circle.fill"
          size={24}
          tintColor={theme.colors.primary}
        />
      )}
    </Pressable>
  );
}

function SearchNote({ search }: { search: PlaceSearch }) {
  const { theme } = useUnistyles();
  switch (search.status) {
    case "searching":
      return (
        <View
          style={styles.note}
          accessibilityLabel={t("tripPlanner.searching")}
        >
          <ActivityIndicator color={theme.colors.muted} />
        </View>
      );
    case "unavailable":
    case "failed":
      return (
        <ThemedText variant="footnote" style={[styles.note, styles.muted]}>
          {t("tripPlanner.searchUnavailable")}
        </ThemedText>
      );
    case "done":
      return search.places.length === 0 ? (
        <ThemedText variant="footnote" style={[styles.note, styles.muted]}>
          {t("tripPlanner.searchEmpty")}
        </ThemedText>
      ) : null;
    case "idle":
      return null;
  }
}

function onList(detail: SharedListDetail, place: TripPlace): boolean {
  return detail.places.some((row) => sameTripPlace(row, place));
}

function useSavedPlaces(
  detail: SharedListDetail | null | undefined,
  query: string,
) {
  const places = useQuery(
    convexQuery(api.mapPlaces.listMapPlaces, detail?.covered ? {} : "skip"),
  );
  if (!detail) return [];
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (places.data ?? []).filter(
    (place) =>
      detail.cities.some((city) => inCity(place, city)) &&
      !onList(detail, place) &&
      words.every((word) => place.name.toLocaleLowerCase().includes(word)),
  );
}

export default function AddListPlaceScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const params = useLocalSearchParams<{ listId: string; city?: string }>();
  const listId = params.listId as Id<"sharedLists">;
  const detail = useQuery(
    convexQuery(api.sharedLists.getSharedList, { listId }),
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const city = params.city ?? detail.data?.cities[0] ?? "";
  const searchAction = useAction(api.tripPlanner.searchListPlaces);
  const run = useCallback(
    (text: string) => searchAction({ listId, city, query: text, locale }),
    [searchAction, listId, city, locale],
  );
  const search = usePlaceSearch(
    run,
    detail.data?.covered && city !== "" ? query : "",
  );
  const addFound = useMutation(api.sharedLists.addSharedListPlace);
  const addSave = useMutation(api.sharedLists.addSavePlaces);
  const saved = useSavedPlaces(detail.data, query);
  const close = useCallback(() => backOrHome(router), [router]);
  const data = detail.data;

  const pick = async (from: "search" | "save", add: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await add();
      analytics.capture("shared_list_place_added", { from });
      void haptics.success();
      close();
    } catch (error) {
      analytics.captureError("shared_list_add_failed", error);
      Alert.alert(t("tripPlanner.addFailed"));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <>
      <Stack.Screen
        options={{
          title: t("tripPlanner.addPlace"),
          headerTitleStyle: {
            ...theme.type.title,
            color: theme.colors.foreground,
          },
          ...(Platform.OS === "android"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="xmark"
                    label={t("common.close")}
                    onPress={close}
                  />
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="xmark"
            tintColor={theme.colors.foreground}
            onPress={close}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );

  if (!data) {
    return (
      <View style={styles.screen} accessibilityViewIsModal>
        {header}
      </View>
    );
  }
  if (!data.covered) {
    return (
      <View style={styles.screen} accessibilityViewIsModal>
        {header}
        <View style={styles.content}>
          <ThemedText variant="title">
            {t("sharedLists.notCoveredTitle")}
          </ThemedText>
          <ThemedText variant="body" style={styles.muted}>
            {t("sharedLists.notCoveredBody")}
          </ThemedText>
          <Button
            title={t("planGate.seePlans")}
            onPress={() => void openPaywall(router, "shared_list_search")}
          />
        </View>
      </View>
    );
  }

  const placeholder = t("tripPlanner.searchPlaceholder", { city });
  const results = search.status === "done" ? search.places : [];

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <TextInput
          testID="add-list-place-search"
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={placeholder}
          maxLength={MAX_QUERY_LENGTH}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.input}
        />

        {query.trim().length > 0 ? (
          <View style={styles.section}>
            <ThemedText variant="bodyLabel" accessibilityRole="header">
              {t("tripPlanner.onAppleMaps")}
            </ThemedText>
            <SearchNote search={search} />
            {results.map((place) => (
              <PlaceRow
                key={place.appleId ?? `${place.name}-${place.lat}`}
                name={place.name}
                detail={place.area}
                added={onList(data, place)}
                disabled={busy}
                onPress={() =>
                  void pick("search", () =>
                    addFound({
                      listId,
                      place: { ...place, city },
                    }),
                  )
                }
              />
            ))}
          </View>
        ) : null}

        {saved.length > 0 ? (
          <View style={styles.section}>
            <ThemedText variant="bodyLabel" accessibilityRole="header">
              {t("tripPlanner.fromSaves")}
            </ThemedText>
            {saved.map((place) => (
              <PlaceRow
                key={`${place.itemId}-${place.name}`}
                name={place.name}
                detail={place.city}
                added={false}
                disabled={busy}
                onPress={() =>
                  void pick("save", () =>
                    addSave({
                      listId,
                      itemId: place.itemId,
                      ...(place.city ? { city: place.city } : {}),
                    }),
                  )
                }
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(4),
  },
  input: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
  },
  section: { gap: theme.gap(1) },
  place: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  placeText: { flex: 1, gap: theme.gap(0.25) },
  note: { paddingVertical: theme.gap(1) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
