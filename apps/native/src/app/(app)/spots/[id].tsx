import { CityMap } from "@/components/city/city-map";
import { PinBadge } from "@/components/onboarding/sample-trip-map";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { cityPins, type CityPin } from "@/lib/city-pins";
import { t, useAppLocale } from "@/lib/i18n";
import { springIn } from "@/lib/motion";
import { type Reveal, revealFor } from "@/lib/spots-reveal";
import { useDroppedPins } from "@/lib/use-dropped-pins";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.55;
const TICK_MS = 500;

/** The reveal for one save, re-read every half second so the waits can run out. */
function useReveal(id: string): { reveal: Reveal; waitedMs: number } {
  const item = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<"items"> }),
  );
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  // When the save was first seen ready; set during render, the way city-map holds its camera.
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const save = item.isError ? null : item.data;
  if (save?.status === "ready" && readyAt === null) setReadyAt(now);
  const waitedMs = now - startedAt;
  const reveal = revealFor(
    save,
    waitedMs,
    readyAt === null ? 0 : now - readyAt,
  );
  const settled = reveal.kind !== "finding";
  useEffect(() => {
    if (settled) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [settled]);
  return { reveal, waitedMs };
}

/** After one shared link: its spots drop onto the city they belong to, or the share ends on Home as before. */
export default function SpotsScreen() {
  useAppLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reveal, waitedMs } = useReveal(id ?? "");

  const reported = useRef(false);
  useEffect(() => {
    if (reveal.kind === "finding" || reported.current) return;
    reported.current = true;
    if (reveal.kind === "spots") {
      analytics.capture("share_spots_revealed", {
        pin_count: reveal.pins.length,
        waited_ms: waitedMs,
      });
    } else {
      analytics.capture("share_spots_skipped", {
        reason: reveal.reason,
        waited_ms: waitedMs,
      });
      router.replace("/(app)/(tabs)/(home)");
    }
  }, [reveal, waitedMs, router]);

  if (reveal.kind !== "spots") {
    return <ScreenLoader label={t("spots.finding")} />;
  }
  return <Spots itemId={id ?? ""} city={reveal.city} found={reveal.pins} />;
}

function Spots({
  itemId,
  city,
  found,
}: {
  itemId: string;
  city: string;
  found: Extract<Reveal, { kind: "spots" }>["pins"];
}) {
  const router = useRouter();
  const { rt } = useUnistyles();
  const reduced = useReducedMotion();
  // Fixed once shown, so a late Apple lookup does not reshuffle the drop.
  const [pins] = useState<CityPin[]>(() =>
    cityPins([{ _id: itemId, placePins: found }]),
  );
  const dropped = useDroppedPins(pins.length);
  const mapHeight = rt.screen.height * MAP_SHARE;
  const openCity = () => {
    analytics.capture("share_spots_city_opened", { pin_count: pins.length });
    router.replace({ pathname: "/city/[name]", params: { name: city } });
  };
  return (
    <View style={styles.screen}>
      <View style={[styles.map, { height: mapHeight }]}>
        <CityMap
          pins={pins}
          selected={null}
          height={mapHeight}
          coveredBottom={0}
          onSelect={() => undefined}
          visible={dropped}
        />
        <View style={[styles.added, { top: rt.insets.top + 12 }]}>
          <Text style={styles.addedText}>{t("spots.addedTo", { city })}</Text>
        </View>
      </View>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {t("spots.count", { count: pins.length })}
        </Text>
        <ScrollView
          style={styles.rows}
          showsVerticalScrollIndicator={false}
          accessibilityLiveRegion="polite"
        >
          {pins.map((pin, index) => (
            <SpotRow
              key={`${pin.name}:${index < dropped ? "shown" : "waiting"}`}
              pin={pin}
              shown={index < dropped}
              reduced={reduced}
            />
          ))}
        </ScrollView>
        <View style={[styles.actions, { paddingBottom: rt.insets.bottom }]}>
          <Button title={t("spots.openCity", { city })} onPress={openCity} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(app)/(tabs)/(home)")}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>{t("common.done")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Every row takes its room from the start, so the sheet's size stays put while the pins drop. */
function SpotRow({
  pin,
  shown,
  reduced,
}: {
  pin: CityPin;
  shown: boolean;
  reduced: boolean;
}) {
  const row = (
    <>
      <PinBadge number={pin.number} day={0} />
      <Text style={styles.spotName}>{pin.name}</Text>
    </>
  );
  return shown ? (
    <Animated.View entering={springIn(reduced)} style={styles.spot}>
      {row}
    </Animated.View>
  ) : (
    <View
      style={[styles.spot, styles.waiting]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {row}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  map: {
    overflow: "hidden",
  },
  added: {
    position: "absolute",
    left: theme.gap(3),
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
  },
  addedText: {
    ...theme.type.footnote,
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
  sheet: {
    flex: 1,
    marginTop: -theme.gap(3),
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1),
    gap: theme.gap(1.5),
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.border,
  },
  title: {
    ...theme.type.sheetTitle,
    color: theme.colors.foreground,
  },
  rows: {
    flexGrow: 0,
    flexShrink: 1,
  },
  spot: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  waiting: {
    opacity: 0,
  },
  spotName: {
    ...theme.type.headline,
    flex: 1,
    color: theme.colors.foreground,
  },
  actions: {
    marginTop: "auto",
    gap: theme.gap(0.5),
  },
  done: {
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
  },
  doneText: {
    ...theme.type.headline,
    color: theme.colors.primary,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
