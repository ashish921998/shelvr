import { TripSegments } from "@/components/trip/trip-segments";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import {
  dayColor,
  formatTripDay,
  tripDayDate,
  type Trip,
  type TripDayView,
  type TripSlot,
  type TripStopView,
} from "@/lib/trip";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export function slotLabel(slot: TripSlot): string {
  switch (slot) {
    case "morning":
      return t("trip.slotMorning");
    case "lunch":
      return t("trip.slotLunch");
    case "afternoon":
      return t("trip.slotAfternoon");
    case "dinner":
      return t("trip.slotDinner");
    case "evening":
      return t("trip.slotEvening");
  }
}

function gapLabel(gap: TripSlot, area: string | undefined): string {
  if (gap === "lunch") {
    return area ? t("trip.gapLunchNear", { area }) : t("trip.gapLunch");
  }
  return area ? t("trip.gapDinnerNear", { area }) : t("trip.gapDinner");
}

function dayTitle(day: TripDayView, index: number): string {
  const number = String(index + 1);
  if (day.areas.length >= 2) {
    return t("trip.dayTitleTwo", {
      day: number,
      first: day.areas[0],
      second: day.areas[1],
    });
  }
  if (day.areas.length === 1) {
    return t("trip.dayTitleOne", { day: number, area: day.areas[0] });
  }
  return t("trip.dayTab", { day: number });
}

function StopRow({
  stop,
  index,
  color,
  order,
  onPress,
}: {
  stop: TripStopView;
  index: number;
  color: string;
  order: number;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(80 + order * 60)
        .springify()
        .damping(18)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.springify().damping(20)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${index + 1}. ${stop.name}, ${slotLabel(stop.slot)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
      >
        <View style={[styles.badge, { backgroundColor: color }]}>
          <ThemedText variant="captionStrong" style={styles.onTint}>
            {index + 1}
          </ThemedText>
        </View>
        <View style={styles.stopText}>
          <ThemedText variant="subheadStrong" numberOfLines={1}>
            {stop.name}
          </ThemedText>
          <ThemedText variant="caption" numberOfLines={1} style={styles.muted}>
            {`${slotLabel(stop.slot)} · ${stop.why}`}
          </ThemedText>
        </View>
        {stop.cover ? (
          <Image
            source={{ uri: stop.cover }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

type Props = {
  trip: Trip;
  activeDay: number;
  onDayChange: (day: number) => void;
  onSelectStop: (stop: number) => void;
};

/**
 * Day tabs, the open day's heading, and its stops in order, with the meals
 * it has no saved place for shown as gaps. Switching days replays the list.
 */
export function TripDayPanel({
  trip,
  activeDay,
  onDayChange,
  onSelectStop,
}: Props) {
  useAppLocale();
  const day = trip.days[activeDay];
  const date = tripDayDate(trip.startDate, activeDay);
  const color = dayColor(activeDay);
  const subtitle = [
    date ? formatTripDay(date) : null,
    t("trip.stopCount", { count: day?.stops.length ?? 0 }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.panel}>
      <View style={styles.tabs}>
        <TripSegments
          scroll
          labels={trip.days.map((_, i) =>
            t("trip.dayTab", { day: String(i + 1) }),
          )}
          selected={activeDay}
          onSelect={onDayChange}
          tintFor={dayColor}
        />
      </View>
      {day ? (
        <Animated.View
          key={activeDay}
          entering={FadeIn.duration(220)}
          style={styles.body}
        >
          <View style={styles.heading}>
            <ThemedText variant="title">{dayTitle(day, activeDay)}</ThemedText>
            <ThemedText variant="caption" style={styles.muted}>
              {subtitle}
            </ThemedText>
          </View>
          {day.stops.length === 0 ? (
            <ThemedText variant="subhead" style={styles.muted}>
              {t("trip.emptyDay")}
            </ThemedText>
          ) : null}
          {day.stops.map((stop, index) => (
            <StopRow
              key={`${activeDay}-${stop.itemId}-${stop.name}`}
              stop={stop}
              index={index}
              order={index}
              color={color}
              onPress={() => onSelectStop(index)}
            />
          ))}
          {day.gaps.map((gap, i) => (
            <Animated.View
              key={`gap-${activeDay}-${gap}`}
              entering={FadeIn.delay(160 + (day.stops.length + i) * 60)}
              layout={LinearTransition}
              style={styles.gap}
            >
              <ThemedText variant="caption" style={styles.muted}>
                {gapLabel(gap, day.areas[0])}
              </ThemedText>
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    gap: theme.gap(1.5),
  },
  tabs: {
    marginHorizontal: -theme.gap(2),
  },
  body: {
    gap: theme.gap(0.5),
  },
  heading: {
    gap: theme.gap(0.25),
    marginBottom: theme.gap(1),
  },
  muted: {
    color: theme.colors.muted,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  onTint: {
    color: theme.colors.onTint,
  },
  stopText: {
    flex: 1,
    gap: 2,
  },
  thumb: {
    width: 40,
    height: 48,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumbEmpty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  gap: {
    marginTop: theme.gap(1),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
