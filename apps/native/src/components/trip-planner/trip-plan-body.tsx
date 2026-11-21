import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Chip } from "@/components/trip-planner/chip";
import { TripDayPreview } from "@/components/trip-planner/trip-day-preview";
import { TripPlannerMap } from "@/components/trip-planner/trip-planner-map";
import { TripStopRow } from "@/components/trip-planner/trip-stop-row";
import { TripStopDetailsSheet } from "@/components/trip-planner/trip-stop-details-sheet";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { UndoBar } from "@/components/ui/undo-bar";
import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard } from "@/lib/apple-place-card";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { moveTargets, useAddTripStop, useTripEditor } from "@/lib/trip-edit";
import {
  countryFlag,
  dayColor,
  sharedSaveStops,
  stopAction,
  tripCountryLine,
  tripCoverUri,
  tripDayLabel,
  tripLengthLine,
  tripName,
  tripStopsLine,
} from "@/lib/trip-planner";
import { usePlaceOpener } from "@/lib/use-place-opener";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { STOPS_PER_DAY } from "@convex/model/trip";
import {
  type TripPlanDetail,
  type TripPlanStop,
  type TripSavePlace,
  UNPLANNED_DAY,
} from "@convex/model/tripPlan";
import { useQuery } from "convex/react";
import { Image } from "expo-image";
import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function StopActionMenu({
  trip,
  stop,
  day,
  index,
  editor,
  onDetails,
}: {
  trip: TripPlanDetail;
  stop: TripPlanStop;
  day: number;
  index: number;
  editor: ReturnType<typeof useTripEditor>;
  onDetails: () => void;
}) {
  const { theme } = useUnistyles();
  const label = t("tripPlanner.stopActions", { name: stop.name });
  const planned = day !== UNPLANNED_DAY;
  const moveTo = (targetDay: number, targetIndex: number) =>
    void editor.moveStop(
      stop._id,
      { day: targetDay, index: targetIndex },
      "menu",
    );
  const actions = [
    { label: t("tripPlanner.stopDetails"), onPress: onDetails },
    ...(planned && index > 0
      ? [
          {
            label: t("tripPlanner.moveUp"),
            onPress: () => moveTo(day, index - 1),
          },
        ]
      : []),
    ...(planned && index < (trip.days[day - 1]?.length ?? 0) - 1
      ? [
          {
            label: t("tripPlanner.moveDown"),
            onPress: () => moveTo(day, index + 1),
          },
        ]
      : []),
    ...moveTargets(trip, day)
      .filter((target) => target.day !== UNPLANNED_DAY)
      .map((target) => ({
        label: target.label,
        onPress: () => moveTo(target.day, Number.MAX_SAFE_INTEGER),
      })),
    ...(planned
      ? [
          {
            label: t("tripPlanner.removeFromDay"),
            destructive: true,
            onPress: () => void editor.removeStop(stop),
          },
        ]
      : []),
  ];
  return (
    <ActionMenu
      label={label}
      title={label}
      style={styles.move}
      actions={actions}
    >
      <AppSymbolIcon name="ellipsis" size={19} tintColor={theme.colors.muted} />
    </ActionMenu>
  );
}

/** Whether the trip has anything to pin, so the map (and the header floating over it) shows. */
function hasMapPoints(trip: TripPlanDetail): boolean {
  return (
    trip.days.some((day) => day.length > 0) || trip.stay?.lat !== undefined
  );
}

function useStopOpener() {
  const { open } = usePlaceOpener<TripPlanStop>(
    stopAction,
    "trip_plan_maps_failed",
  );
  return useCallback(
    (stop: TripPlanStop) => {
      void haptics.selection();
      const action = stopAction(stop, canOpenPlaceCard(stop.appleId));
      analytics.capture("trip_plan_stop_opened", {
        source: stop.source,
        action: action.kind,
      });
      open(stop, action);
    },
    [open],
  );
}

function DayAction({
  icon,
  label,
  onPress,
  disabled,
  selected,
}: {
  icon: AppSymbolName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        selected && styles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <AppSymbolIcon
        name={icon}
        size={16}
        tintColor={theme.colors.primaryText}
      />
      <ThemedText variant="labelStrong" style={styles.accent}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TripDayTabs({
  trip,
  day,
  onPick,
}: {
  trip: TripPlanDetail;
  day: number | null;
  onPick: (day: number | null) => void;
}) {
  const { theme } = useUnistyles();
  const fill = {
    background: theme.colors.foreground,
    foreground: theme.colors.background,
  };
  return (
    <ScrollView
      horizontal
      style={styles.tabs}
      contentContainerStyle={styles.tabRow}
      showsHorizontalScrollIndicator={false}
    >
      <Chip
        label={t("tripDay.overview")}
        selected={day === null}
        pick="radio"
        fill={fill}
        onPress={() => onPick(null)}
      />
      {trip.days.map((_, index) => (
        <Chip
          key={index}
          label={tripDayLabel(index, undefined)}
          selected={day === index}
          pick="radio"
          fill={fill}
          dot={dayColor(index, theme.colors.tripDays)}
          onPress={() => onPick(index)}
        />
      ))}
    </ScrollView>
  );
}

function Overview({
  trip,
  onPick,
}: {
  trip: TripPlanDetail;
  onPick: (day: number) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.overview}>
      {trip.days.map((stops, index) => (
        <Pressable
          key={index}
          accessibilityRole="button"
          onPress={() => onPick(index)}
          style={({ pressed }) => [
            styles.overviewRow,
            pressed && styles.pressed,
          ]}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: dayColor(index, theme.colors.tripDays) },
            ]}
          />
          <ThemedText variant="bodyLabel" style={styles.flex}>
            {tripDayLabel(index, trip.startDate)}
          </ThemedText>
          <ThemedText variant="caption" style={styles.muted}>
            {t("trip.stopCount", { count: stops.length })}
          </ThemedText>
          <AppSymbolIcon
            name="chevron.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      ))}
    </View>
  );
}

function TripHeading({
  trip,
  compact,
  hasMap,
  showMap,
  onToggleMap,
}: {
  trip: TripPlanDetail;
  compact: boolean;
  hasMap: boolean;
  showMap: boolean;
  onToggleMap: () => void;
}) {
  const stops = trip.days.flat();
  const destination = trip.countries ? tripCountryLine(trip.countries) : null;
  return (
    <View style={styles.tripHeading}>
      {!compact && trip.cover ? (
        <Image source={tripCoverUri(trip.cover)} style={styles.cover} />
      ) : null}
      {!compact && !trip.cover && trip.countries?.[0] ? (
        <View style={styles.cover}>
          <ThemedText variant="header">
            {countryFlag(trip.countries[0])}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.flex}>
        <ThemedText
          variant={compact ? "header" : "largeTitle"}
          accessibilityRole="header"
        >
          {tripName(trip)}
        </ThemedText>
        {!compact ? (
          <>
            <ThemedText variant="caption" style={styles.muted}>
              {tripLengthLine(trip)}
            </ThemedText>
            {destination ? (
              <ThemedText variant="caption" style={styles.muted}>
                {destination}
              </ThemedText>
            ) : null}
            {stops.length ? (
              <ThemedText variant="caption" style={styles.muted}>
                {tripStopsLine({
                  stopCount: stops.length,
                  savedCount: stops.filter((stop) => stop.source === "save")
                    .length,
                })}
              </ThemedText>
            ) : null}
            {trip.stay ? (
              <ThemedText variant="caption" style={styles.muted}>
                {t("tripPlanner.stayingAt", { name: trip.stay.name })}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </View>
      {hasMap ? (
        <DayAction
          icon="map"
          label={t("navigation.map")}
          onPress={onToggleMap}
          selected={showMap}
        />
      ) : null}
    </View>
  );
}

function TripDaySaves({
  tripId,
  day,
  label,
  places,
}: {
  tripId: Id<"tripPlans">;
  day: number;
  label: string;
  places: TripSavePlace[];
}) {
  const { theme } = useUnistyles();
  const add = useAddTripStop(tripId);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const pick = async (place: TripSavePlace) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (
        await add(day, { kind: "save", itemId: place.itemId, name: place.name })
      )
        void haptics.success();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (!places.length) return null;
  return (
    <View style={styles.saves}>
      <ThemedText variant="header" accessibilityRole="header">
        {t("tripPlanner.fromSaves")}
      </ThemedText>
      {places.slice(0, 4).map((place) => (
        <Pressable
          key={place.itemId + place.name}
          accessibilityRole="button"
          disabled={busy}
          accessibilityLabel={t("tripDay.addSaveToDay", {
            name: place.name,
            day: label,
          })}
          onPress={() => void pick(place)}
          style={({ pressed }) => [styles.saveRow, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <ThemedText variant="bodyLabel">{place.name}</ThemedText>
            {place.title && place.title !== place.name ? (
              <ThemedText
                variant="caption"
                style={styles.muted}
                numberOfLines={1}
              >
                {place.title}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.addSave}>
            <AppSymbolIcon
              name="plus"
              size={16}
              tintColor={theme.colors.primaryText}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TripDayHeading({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  return (
    <View style={styles.dayHeading}>
      <ThemedText
        variant="title"
        accessibilityRole="header"
        style={styles.flex}
      >
        {label}
      </ThemedText>
      <DayAction
        icon="plus"
        label={t("tripPlanner.addPlace")}
        onPress={onAdd}
      />
    </View>
  );
}

function TripDayPlan({
  trip,
  index,
  places,
  onAdd,
  onPreview,
  mapMode,
  children,
}: {
  trip: TripPlanDetail;
  index: number;
  places: TripSavePlace[] | undefined;
  onAdd: () => void;
  onPreview?: (places: TripSavePlace[]) => void;
  mapMode: boolean;
  children: React.ReactNode;
}) {
  const day = index + 1;
  const label = tripDayLabel(index, trip.startDate);
  const empty = (trip.days[index]?.length ?? 0) === 0;
  return (
    <View style={styles.day}>
      {mapMode ? null : <TripDayHeading label={label} onAdd={onAdd} />}
      {empty ? (
        <View style={styles.emptyDay}>
          <ThemedText variant="body" style={styles.flex}>
            {t("tripSetup.emptyDay")}
          </ThemedText>
          {!mapMode && places?.length && onPreview ? (
            <DayAction
              icon="dice.fill"
              label={t("tripSetup.fillDay")}
              onPress={() => onPreview(places)}
            />
          ) : null}
        </View>
      ) : (
        children
      )}
      {mapMode ? null : (
        <TripDaySaves
          tripId={trip._id}
          day={day}
          label={label}
          places={places ?? []}
        />
      )}
    </View>
  );
}

export function TripPlanBody({
  trip,
  canUseSaves,
  canFillFromSaves,
  day,
  onPickDay,
  onAddPlace,
}: {
  trip: TripPlanDetail;
  canUseSaves: boolean;
  canFillFromSaves: boolean;
  day: number | null;
  onPickDay: (day: number | null) => void;
  onAddPlace: (day: number) => void;
}) {
  const { rt, theme } = useUnistyles();
  const focused = useIsFocused();
  const [showMap, setShowMap] = useState(false);
  const [preview, setPreview] = useState<{
    index: number;
    places: TripSavePlace[];
  } | null>(null);
  const [details, setDetails] = useState<TripPlanStop | null>(null);
  const editor = useTripEditor(trip);
  const openStop = useStopOpener();
  const places = useQuery(
    api.tripPlannerData.tripSavePlaces,
    !canUseSaves || day === null || showMap ? "skip" : { tripId: trip._id },
  );
  const hasMap = hasMapPoints(trip);
  const mapHasPoints =
    day === null
      ? hasMap
      : Boolean(trip.days[day]?.length || trip.stay?.lat !== undefined);
  const fromSave = useMemo(
    () => sharedSaveStops([...trip.days.flat(), ...trip.unplanned]),
    [trip.days, trip.unplanned],
  );

  const stopRows = (stops: TripPlanStop[], dayNumber: number) =>
    stops.map((stop, index) => (
      <TripStopRow
        key={stop._id}
        stop={stop}
        number={dayNumber > 0 ? index + 1 : undefined}
        dayColor={
          dayNumber > 0
            ? {
                color: dayColor(dayNumber - 1, theme.colors.tripDays),
                on: theme.colors.onTripDay,
              }
            : undefined
        }
        fromSave={fromSave.has(stop._id)}
        action={
          <StopActionMenu
            trip={trip}
            stop={stop}
            day={dayNumber}
            index={index}
            editor={editor}
            onDetails={() => setDetails(stop)}
          />
        }
        onPress={() => openStop(stop)}
      />
    ));
  return (
    <View
      style={styles.screen}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? "auto" : "no-hide-descendants"}
    >
      <TripHeading
        trip={trip}
        compact={day !== null}
        hasMap={hasMap}
        showMap={showMap}
        onToggleMap={() => setShowMap(!showMap)}
      />
      <TripDayTabs trip={trip} day={day} onPick={onPickDay} />
      {showMap && day !== null ? (
        <View style={styles.mapDayHeading}>
          <TripDayHeading
            label={tripDayLabel(day, trip.startDate)}
            onAdd={() => onAddPlace(day + 1)}
          />
        </View>
      ) : null}
      {showMap && mapHasPoints ? (
        <TripPlannerMap
          key={day === null ? "overview-map" : "day-map"}
          days={trip.days}
          stay={trip.stay}
          activeDay={day}
          height={rt.screen.height * 0.33}
          onSelectDay={onPickDay}
          embedded
        />
      ) : null}
      <ScrollView
        key={day ?? "overview"}
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        {day === null ? (
          <>
            <Overview trip={trip} onPick={onPickDay} />
            {trip.unplanned.length ? (
              <View style={styles.day}>
                <ThemedText variant="header" accessibilityRole="header">
                  {t("tripPlanner.unplanned")}
                </ThemedText>
                {stopRows(trip.unplanned, UNPLANNED_DAY)}
              </View>
            ) : null}
          </>
        ) : (
          <TripDayPlan
            trip={trip}
            index={day}
            places={canUseSaves ? places : undefined}
            mapMode={showMap}
            onAdd={() => onAddPlace(day + 1)}
            onPreview={
              canFillFromSaves
                ? (suggestions) =>
                    setPreview({ index: day, places: suggestions })
                : undefined
            }
          >
            {stopRows(trip.days[day] ?? [], day + 1)}
          </TripDayPlan>
        )}
      </ScrollView>
      <UndoBar
        message={editor.undo?.message ?? null}
        onUndo={() => void editor.undoLast()}
      />
      {details ? (
        <TripStopDetailsSheet
          key={details._id}
          stop={details}
          onClose={() => setDetails(null)}
        />
      ) : null}
      {canFillFromSaves && preview ? (
        <TripDayPreview
          tripId={trip._id}
          day={preview.index + 1}
          label={tripDayLabel(preview.index, trip.startDate)}
          limit={STOPS_PER_DAY[trip.pace]}
          places={preview.places}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  mapDayHeading: {
    paddingHorizontal: theme.gap(2.5),
    paddingVertical: theme.gap(1.25),
  },
  tripHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    paddingVertical: theme.gap(1.5),
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  tabs: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  tabRow: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: theme.gap(1.5),
  },
  content: {
    gap: theme.gap(2.5),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(3),
  },
  overview: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  overviewRow: {
    flexDirection: "row",
    minHeight: 54,
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  day: { gap: theme.gap(1) },
  dayHeading: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  emptyDay: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
  },
  saves: { gap: theme.gap(0.5), paddingTop: theme.gap(2) },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    minHeight: theme.control.minHeight,
    paddingVertical: theme.gap(0.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  addSave: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  action: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
  },
  selected: { borderWidth: 1, borderColor: theme.colors.primaryText },
  move: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { color: theme.colors.muted },
  accent: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
