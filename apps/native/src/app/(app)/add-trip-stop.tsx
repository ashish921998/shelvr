import { AppSymbolIcon } from "@/components/symbol";
import { Chip } from "@/components/trip-planner/chip";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import {
  editDayLabel,
  matchSavePlaces,
  type NewTripStop,
  onTrip,
  type PlaceSearch,
  useAddTripStop,
  useTripPlaceSearch,
} from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UNPLANNED_DAY } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
      accessibilityLabel={[name, detail, added ? t("tripPlanner.onTrip") : null]
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
          {t("tripPlanner.onTrip")}
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
      return (
        <ThemedText variant="footnote" style={[styles.note, styles.muted]}>
          {t("tripPlanner.searchUnavailable")}
        </ThemedText>
      );
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

/** Add a place: search Apple Maps near the trip, or pick a place from the city's saves. */
export default function AddTripStopScreen() {
  const locale = useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const params = useLocalSearchParams<{ tripId: string; day?: string }>();
  const tripId = params.tripId as Id<"tripPlans">;
  const trip = useQuery(
    convexQuery(api.tripPlannerData.getTripPlan, { tripId }),
  );
  const saves = useQuery(
    convexQuery(api.tripPlannerData.tripSavePlaces, { tripId }),
  );
  const asked = Number(params.day);
  const [day, setDay] = useState(Number.isInteger(asked) ? asked : 1);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useTripPlaceSearch(tripId, query, locale);
  const add = useAddTripStop(tripId);
  const close = useCallback(() => backOrHome(router), [router]);
  const data = trip.data;

  const days = useMemo(
    () =>
      data
        ? [
            ...Array.from({ length: data.dayCount }, (_, i) => i + 1),
            UNPLANNED_DAY,
          ]
        : [],
    [data],
  );
  const savePlaces = matchSavePlaces(saves.data ?? [], query);

  const pick = async (place: NewTripStop) => {
    if (busy) return;
    setBusy(true);
    const added = await add(day, place);
    setBusy(false);
    if (!added) return;
    if (process.env.EXPO_OS === "ios") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    close();
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

  const fill = {
    background: theme.colors.primary,
    foreground: theme.colors.onTint,
  };
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
          testID="add-trip-stop-search"
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={t("tripPlanner.searchPlaceholder", {
            city: data.city,
          })}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={t("tripPlanner.searchPlaceholder", {
            city: data.city,
          })}
          maxLength={MAX_QUERY_LENGTH}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.input}
        />

        <View style={styles.section}>
          <ThemedText variant="bodyLabel" accessibilityRole="header">
            {t("tripPlanner.addTo")}
          </ThemedText>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {days.map((option) => (
              <Chip
                key={option}
                label={editDayLabel(option, data.startDate)}
                selected={option === day}
                pick="radio"
                fill={fill}
                onPress={() => setDay(option)}
              />
            ))}
          </ScrollView>
        </View>

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
                added={onTrip(data, place)}
                disabled={busy}
                onPress={() => void pick({ kind: "search", place })}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <ThemedText variant="bodyLabel" accessibilityRole="header">
            {t("tripPlanner.fromSaves")}
          </ThemedText>
          {saves.data !== undefined && saves.data.length === 0 ? (
            <ThemedText variant="footnote" style={styles.muted}>
              {t("tripPlanner.noSavesLeft")}
            </ThemedText>
          ) : null}
          {savePlaces.map((place) => (
            <PlaceRow
              key={`${place.itemId}-${place.name}`}
              name={place.name}
              detail={place.title}
              added={false}
              disabled={busy}
              onPress={() =>
                void pick({
                  kind: "save",
                  itemId: place.itemId,
                  name: place.name,
                })
              }
            />
          ))}
        </View>
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
  chips: { gap: theme.gap(1) },
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
