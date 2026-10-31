import { CityMap } from "@/components/city/city-map";
import { SaveRow } from "@/components/city/save-row";
import { PinBadge } from "@/components/onboarding/sample-trip-map";
import { Button } from "@/components/ui/button";
import { StitchMark } from "@/components/ui/stitch-mark";
import { analytics } from "@/lib/analytics";
import { cityPinId, cityPins, type CityPin } from "@/lib/city-pins";
import { t, useAppLocale } from "@/lib/i18n";
import { springIn } from "@/lib/motion";
import { placeCategoryLabel } from "@/lib/place-category";
import { type Reveal, revealFor } from "@/lib/spots-reveal";
import { useDroppedPins } from "@/lib/use-dropped-pins";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.45;
const TICK_MS = 500;

type Save = NonNullable<FunctionReturnType<typeof api.items.getItem>>;

function useReveal(id: string): {
  reveal: Reveal;
  save: Save | null | undefined;
  waitedMs: number;
} {
  const item = useQuery(
    convexQuery(api.items.getItem, { id: id as Id<"items"> }),
  );
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
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
  return { reveal, save, waitedMs };
}

export default function SpotsScreen() {
  useAppLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reveal, save, waitedMs } = useReveal(id ?? "");

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
    }
  }, [reveal, waitedMs]);

  const gone = reveal.kind === "none";
  useEffect(() => {
    if (gone) router.replace("/(app)/(tabs)/(home)");
  }, [gone, router]);

  if (reveal.kind !== "spots" || !save) {
    return (
      <View
        style={styles.finding}
        accessibilityRole="progressbar"
        accessibilityLabel={t("spots.finding")}
      >
        <StitchMark />
        <Text style={styles.findingText}>{t("spots.finding")}</Text>
      </View>
    );
  }
  return <Spots save={save} city={reveal.city} found={reveal.pins} />;
}

function Spots({
  save,
  city,
  found,
}: {
  save: Save;
  city: string;
  found: Extract<Reveal, { kind: "spots" }>["pins"];
}) {
  const router = useRouter();
  const { rt, theme } = useUnistyles();
  const reduced = useReducedMotion();
  const pins = cityPins([{ _id: save._id, placePins: found }]);
  const dropped = useDroppedPins(pins.length);
  useLandingHaptics(dropped, pins.length);
  const mapHeight = rt.screen.height * MAP_SHARE;
  const openCity = () => {
    analytics.capture("share_spots_city_opened", { pin_count: pins.length });
    router.dismissTo("/(app)/(tabs)/(home)");
    router.push({ pathname: "/city/[name]", params: { name: city } });
  };
  return (
    <View style={[styles.screen, { paddingTop: rt.insets.top }]}>
      <View style={[styles.map, { height: mapHeight }]}>
        <CityMap
          pins={pins}
          selected={null}
          height={mapHeight}
          coveredBottom={theme.gap(5)}
          onSelect={() => undefined}
          visible={dropped}
        />
        <View style={styles.added}>
          <Text style={styles.addedText}>{t("spots.addedTo", { city })}</Text>
        </View>
      </View>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {t("spots.count", { count: pins.length })}
        </Text>
        <SaveRow item={save} />
        <ScrollView style={styles.rows} accessibilityLiveRegion="polite">
          {pins.map((pin, index) => (
            <SpotRow
              key={`${cityPinId(pin)}:${index < dropped ? "shown" : "waiting"}`}
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

function useLandingHaptics(dropped: number, total: number) {
  useEffect(() => {
    if (process.env.EXPO_OS !== "ios" || dropped === 0) return;
    void (dropped >= total
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  }, [dropped, total]);
}

function SpotRow({
  pin,
  shown,
  reduced,
}: {
  pin: CityPin;
  shown: boolean;
  reduced: boolean;
}) {
  const category = placeCategoryLabel(pin.category);
  const row = (
    <>
      <PinBadge number={pin.number} day={0} />
      <View style={styles.spotText}>
        <Text style={styles.spotName}>{pin.name}</Text>
        {category ? <Text style={styles.category}>{category}</Text> : null}
      </View>
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
  finding: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(2),
    backgroundColor: theme.colors.background,
  },
  findingText: {
    ...theme.type.headline,
    color: theme.colors.muted,
  },
  added: {
    position: "absolute",
    top: theme.gap(1.5),
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
  spotText: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  spotName: {
    ...theme.type.headline,
    color: theme.colors.foreground,
  },
  category: {
    ...theme.type.footnote,
    color: theme.colors.muted,
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
