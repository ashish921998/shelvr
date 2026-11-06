import { DateStopCard } from "@/components/date-plan/date-stop-card";
import { AppSymbolIcon } from "@/components/symbol";
import { TripPlannerMap } from "@/components/trip-planner/trip-planner-map";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard } from "@/lib/apple-place-card";
import {
  dateShareText,
  directionsUrl,
  infoAction,
  kindLabel,
  slotLabel,
  walkMinutes,
} from "@/lib/date-plan";
import { t } from "@/lib/i18n";
import { dayColor } from "@/lib/trip-planner";
import {
  type DateEvening as Evening,
  type DatePlanResult,
  type DateSlot,
  type DateStop,
  swapStop,
} from "@convex/model/datePlan";
import { haptics } from "@/lib/haptics";
import { usePlaceOpener } from "@/lib/use-place-opener";
import { useCallback, useMemo } from "react";
import { Linking, Pressable, ScrollView, Share, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.38;

/** Opens a stop's place card, its save or Maps, never after the person has left the screen. */
function useInfoOpener() {
  const { open } = usePlaceOpener<DateStop>(
    infoAction,
    "date_plan_maps_failed",
  );
  return useCallback(
    (stop: DateStop) => {
      void haptics.selection();
      const action = infoAction(stop, canOpenPlaceCard(stop.appleId));
      analytics.capture("date_plan_stop_opened", {
        source: stop.source,
        action: action.kind,
      });
      open(stop, action);
    },
    [open],
  );
}

/** The evening: both stops on the map, a card for each with the walk between, and what to do next. */
export function DateEvening({
  result,
  evening,
  onSwap,
  onRestart,
}: {
  result: DatePlanResult;
  evening: Evening;
  onSwap: (slot: DateSlot) => void;
  onRestart: () => void;
}) {
  const { rt, theme } = useUnistyles();
  const openInfo = useInfoOpener();
  const first = result.stops[evening.first];
  const second = result.stops[evening.second];
  const color = dayColor(0, theme.colors.tripDays);
  // One array per evening: a new one each render would move the map's camera every render.
  const days = useMemo(() => [[first, second]], [first, second]);

  const change = (slot: DateSlot) =>
    swapStop(result.stops, evening, slot) !== null
      ? () => {
          void haptics.selection();
          onSwap(slot);
        }
      : undefined;
  const go = () => {
    analytics.capture("date_plan_go", {});
    Linking.openURL(directionsUrl(first)).catch((error: unknown) =>
      analytics.captureError("date_plan_maps_failed", error),
    );
  };
  const send = async () => {
    try {
      const shared = await Share.share({
        message: dateShareText(result.city, first, second),
      });
      analytics.capture("date_plan_sent", {
        shared: shared.action === Share.sharedAction,
      });
    } catch (error) {
      analytics.captureError("date_plan_share_failed", error);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="never"
      // The map stays pinned while the cards scroll under it, so both pins stay in view.
      stickyHeaderIndices={[0]}
      contentContainerStyle={styles.scrollContent}
    >
      <TripPlannerMap
        days={days}
        stay={undefined}
        activeDay={0}
        height={rt.screen.height * MAP_SHARE}
        onSelectDay={() => undefined}
      />
      <View style={styles.content}>
        <View style={styles.heading}>
          <ThemedText variant="largeTitle" accessibilityRole="header">
            {t("datePlan.eveningTitle", { city: result.city })}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("datePlan.changeKindFor", {
              kind: kindLabel(result.kind),
            })}
            onPress={onRestart}
            hitSlop={8}
            style={({ pressed }) => [styles.kind, pressed && styles.pressed]}
          >
            <ThemedText variant="subheadLabel" style={styles.kindText}>
              {kindLabel(result.kind)}
            </ThemedText>
            <AppSymbolIcon
              name="chevron.up.chevron.down"
              size={12}
              tintColor={theme.colors.primaryText}
            />
          </Pressable>
        </View>

        <DateStopCard
          stop={first}
          number={1}
          slot={slotLabel(result.kind, "first")}
          color={color}
          onColor={theme.colors.onTripDay}
          onOpen={() => openInfo(first)}
          onSwap={change("first")}
        />
        <View style={styles.walk}>
          <View style={styles.walkLine} />
          <ThemedText variant="footnote" style={styles.muted}>
            {t("datePlan.walk", {
              minutes: String(walkMinutes(first, second)),
            })}
          </ThemedText>
        </View>
        <DateStopCard
          stop={second}
          number={2}
          slot={slotLabel(result.kind, "second")}
          color={color}
          onColor={theme.colors.onTripDay}
          onOpen={() => openInfo(second)}
          onSwap={change("second")}
        />

        <View style={styles.buttons}>
          <Button title={t("datePlan.send")} onPress={() => void send()} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("datePlan.directions")}
            onPress={go}
            style={({ pressed }) => [
              styles.secondary,
              pressed && styles.pressed,
            ]}
          >
            <AppSymbolIcon
              name="map"
              size={16}
              tintColor={theme.colors.primaryText}
            />
            <ThemedText variant="button" style={styles.secondaryText}>
              {t("datePlan.directions")}
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText variant="caption" style={[styles.muted, styles.note]}>
          {t("datePlan.approximate")}
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: rt.insets.bottom + theme.gap(4) },
  content: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
  },
  heading: { gap: theme.gap(0.5), paddingBottom: theme.gap(1) },
  kind: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  kindText: { color: theme.colors.primaryText },
  muted: { color: theme.colors.muted },
  walk: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingLeft: theme.gap(3),
  },
  walkLine: {
    width: 2,
    height: theme.gap(3),
    borderRadius: 1,
    backgroundColor: theme.colors.border,
  },
  buttons: { gap: theme.gap(1), paddingTop: theme.gap(1.5) },
  secondary: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  secondaryText: { color: theme.colors.primaryText },
  note: { textAlign: "center" },
  pressed: { opacity: theme.opacity.pressed },
}));
