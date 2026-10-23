import {
  CityRow,
  DarkButton,
  EmptyCard,
  PlanCard,
  SectionLabel,
  SpotRow,
} from "@/components/home/home-plan-parts";
import { analytics } from "@/lib/analytics";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import {
  type HomeMode,
  cityProgress,
  daysUntil,
  goalSpaceIds,
  spotRows,
  weekStrip,
} from "@/lib/home-plans";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { canMakePlan } from "@/lib/make-plan";
import { TRIP_MIN_CITY_SAVES, type Trip } from "@/lib/trip";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const MAX_ROWS = 5;
const MAX_JUST_SAVED = 3;
const MAX_PREVIEWS = 3;

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: HomeMode;
  onChange: (mode: HomeMode) => void;
}) {
  const segments: { mode: HomeMode; label: string }[] = [
    { mode: "dates", label: t("homePlans.dateNights") },
    { mode: "trips", label: t("homePlans.trips") },
  ];
  return (
    <View style={styles.switch}>
      {segments.map((segment) => (
        <Pressable
          key={segment.mode}
          accessibilityRole="button"
          accessibilityLabel={segment.label}
          accessibilityState={{ selected: mode === segment.mode }}
          onPress={() => onChange(segment.mode)}
          style={({ pressed }) => [
            styles.segment,
            mode === segment.mode && styles.segmentSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.segmentLabel}>{segment.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DatesPanel({
  spaceId,
  itemCount,
  previews,
}: {
  spaceId: Id<"spaces">;
  itemCount: number;
  previews: string[];
}) {
  const router = useRouter();
  const { guard } = usePaywallGuard("make_plan");
  const space = useQuery(convexQuery(api.spaces.getSpace, { id: spaceId }));
  const [now] = useState(() => new Date());
  if (space.data === undefined) return null;
  const items = space.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyCard
        title={t("homePlans.dateEmptyTitle")}
        body={t("homePlans.dateEmptyBody")}
      />
    );
  }
  return (
    <>
      <PlanCard>
        <View style={styles.weekRow}>
          {weekStrip(now, formattingLocale()).map((day, index) => (
            <View
              key={index}
              style={[styles.day, day.highlighted && styles.dayHighlighted]}
            >
              <Text style={styles.dayLabel}>{day.label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardTitle}>{t("homePlans.fridayNight")}</Text>
        <Text style={styles.muted}>
          {t("homePlans.dateSpotCount", { count: itemCount })}
        </Text>
        {previews.length > 0 ? (
          <View style={styles.previews}>
            {Array.from({ length: MAX_PREVIEWS }, (_, index) =>
              previews[index] ? (
                <Image
                  key={previews[index]}
                  source={{ uri: previews[index] }}
                  style={styles.preview}
                  contentFit="cover"
                />
              ) : (
                <View key={`empty-${index}`} style={styles.preview} />
              ),
            )}
          </View>
        ) : null}
        {canMakePlan(items) ? (
          <DarkButton
            label={t("homePlans.seePlan")}
            onPress={() =>
              void guard(() =>
                router.push({
                  pathname: "/plan/[id]",
                  params: { id: spaceId },
                }),
              )
            }
          />
        ) : (
          <Text style={styles.muted}>{t("homePlans.saveMoreDates")}</Text>
        )}
      </PlanCard>
      <SectionLabel>{t("homePlans.yourDateSpots")}</SectionLabel>
      {spotRows(items, MAX_ROWS).map((item) => (
        <SpotRow key={item._id} item={item} />
      ))}
    </>
  );
}

function tripCover(trip: Trip): string | undefined {
  for (const day of trip.days) {
    const stop = day.stops.find((s) => s.cover !== undefined);
    if (stop) return stop.cover;
  }
  return undefined;
}

function TripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const [now] = useState(() => new Date());
  const cover = tripCover(trip);
  const until = daysUntil(trip.startDate, now);
  const stops = trip.days.reduce((sum, day) => sum + day.stops.length, 0);
  let chip: string | null = null;
  if (until === 0) chip = t("homePlans.today");
  else if (until === 1) chip = t("homePlans.tomorrow");
  else if (until !== null) chip = t("homePlans.inDays", { count: until });
  return (
    <PlanCard>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={styles.cover} />
      )}
      {chip ? (
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>{chip}</Text>
        </View>
      ) : null}
      <Text style={styles.cardTitle}>
        {trip.city ?? t("homePlans.yourTrip")}
      </Text>
      <Text style={styles.muted}>
        {t("homePlans.tripSummary", {
          count: stops,
          days: String(trip.days.length),
        })}
      </Text>
      <DarkButton label={t("homePlans.openDayByDay")} onPress={onOpen} />
    </PlanCard>
  );
}

function TripsPanel({ spaceId }: { spaceId: Id<"spaces"> }) {
  const router = useRouter();
  const { guard } = usePaywallGuard("plan_trip");
  const trip = useQuery(convexQuery(api.tripData.getSpaceTrip, { spaceId }));
  const cities = useQuery(convexQuery(api.tripData.tripCities, { spaceId }));
  const space = useQuery(convexQuery(api.spaces.getSpace, { id: spaceId }));
  if (
    trip.data === undefined ||
    cities.data === undefined ||
    space.data === undefined
  ) {
    return null;
  }
  const rows = cityProgress(cities.data, TRIP_MIN_CITY_SAVES).slice(
    0,
    MAX_ROWS,
  );
  if (trip.data === null && rows.length === 0) {
    return (
      <EmptyCard
        title={t("homePlans.tripEmptyTitle")}
        body={t("homePlans.tripEmptyBody")}
      />
    );
  }
  const openTrip = () =>
    void guard(() =>
      router.push({ pathname: "/trip/[id]", params: { id: spaceId } }),
    );
  const recent = spotRows(
    (space.data?.items ?? []).filter((item) => item.status === "ready"),
    MAX_JUST_SAVED,
  );
  return (
    <>
      {trip.data ? <TripCard trip={trip.data} onOpen={openTrip} /> : null}
      {rows.length > 0 ? (
        <>
          <SectionLabel>{t("homePlans.citiesSaved")}</SectionLabel>
          {rows.map((row) => (
            <CityRow key={row.city} {...row} onPress={openTrip} />
          ))}
        </>
      ) : null}
      {recent.length > 0 ? (
        <>
          <SectionLabel>{t("homePlans.justSaved")}</SectionLabel>
          {recent.map((item) => (
            <SpotRow key={item._id} item={item} />
          ))}
        </>
      ) : null}
    </>
  );
}

export function DateTripHome() {
  useAppLocale();
  const { entitled } = useEntitlement();
  const [mode, setMode] = useState<HomeMode>("dates");
  const spaces = useQuery(
    convexQuery(api.spaces.listSpaces, entitled ? {} : "skip"),
  );
  if (!entitled || spaces.data === undefined) return null;
  const ids = goalSpaceIds(spaces.data);
  const dateSpace = spaces.data.find((space) => space._id === ids.date);

  const change = (next: HomeMode) => {
    if (next === mode) return;
    setMode(next);
    analytics.capture("home_mode_changed", { mode: next });
  };

  let panel: ReactNode;
  if (mode === "dates") {
    panel =
      ids.date && dateSpace ? (
        <DatesPanel
          spaceId={ids.date}
          itemCount={dateSpace.itemCount}
          previews={dateSpace.previews.map((preview) => preview.url)}
        />
      ) : (
        <EmptyCard
          title={t("homePlans.dateEmptyTitle")}
          body={t("homePlans.dateEmptyBody")}
        />
      );
  } else {
    panel = ids.travel ? (
      <TripsPanel spaceId={ids.travel} />
    ) : (
      <EmptyCard
        title={t("homePlans.tripEmptyTitle")}
        body={t("homePlans.tripEmptyBody")}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ModeSwitch mode={mode} onChange={change} />
      {panel}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  switch: {
    flexDirection: "row",
    padding: theme.gap(0.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  segmentSelected: { backgroundColor: theme.colors.surface },
  segmentLabel: { ...theme.type.subheadLabel, color: theme.colors.foreground },
  pressed: { opacity: theme.opacity.pressed },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  day: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  dayHighlighted: { backgroundColor: theme.colors.primary },
  dayLabel: { ...theme.type.label, color: theme.colors.foreground },
  cardTitle: { ...theme.type.title, color: theme.colors.foreground },
  muted: { ...theme.type.footnote, color: theme.colors.muted },
  previews: { flexDirection: "row", gap: theme.gap(1) },
  preview: {
    flex: 1,
    height: 72,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  cover: {
    height: 140,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  chip: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.primarySoft,
  },
  chipLabel: { ...theme.type.captionStrong, color: theme.colors.primaryText },
}));
