import { CityMap } from "@/components/city/city-map";
import { SaveRow } from "@/components/city/save-row";
import { AlsoAddTo } from "@/components/shared-list/also-add-to";
import { PinBadge } from "@/components/onboarding/sample-trip-map";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { StitchMark } from "@/components/ui/stitch-mark";
import { UndoBar } from "@/components/ui/undo-bar";
import { analytics } from "@/lib/analytics";
import { cityPinId, cityPins, type CityPin } from "@/lib/city-pins";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { springIn } from "@/lib/motion";
import { placeCategoryLabel } from "@/lib/place-category";
import { useProGate } from "@/lib/pro-gate";
import { pinsIn, type Reveal, revealFor } from "@/lib/spots-reveal";
import { type SpotsRemoval, useSpotsRemoval } from "@/lib/spots-removal";
import { useDroppedPins } from "@/lib/use-dropped-pins";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
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

  const [city, setCity] = useState<string | null>(null);
  if (
    reveal.kind === "spots" &&
    reveal.city !== city &&
    (city === null || (save && pinsIn(save, city).length === 0))
  )
    setCity(reveal.city);
  const gone =
    reveal.kind === "none" && (city === null || reveal.reason !== "no_place");
  const found = city !== null && save ? pinsIn(save, city) : [];
  const removal = useSpotsRemoval(
    (id ?? "") as Id<"items">,
    found,
    city !== null,
  );
  const focused = useIsFocused();
  useEffect(() => {
    if (gone && focused) router.replace("/(app)/(tabs)/(map)");
  }, [gone, focused, router]);

  if (city === null || save?.status !== "ready") {
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
  return <Spots save={save} city={city} removal={removal} />;
}

function Spots({
  save,
  city,
  removal,
}: {
  save: Save;
  city: string;
  removal: SpotsRemoval;
}) {
  const router = useRouter();
  const { rt, theme } = useUnistyles();
  const reduced = useReducedMotion();
  const editGate = useProGate("edit_places");
  const pins = cityPins([
    { _id: save._id, tags: save.tags, placePins: removal.shown },
  ]);
  const dropped = useDroppedPins(pins.length);
  useLandingHaptics(dropped, pins.length);
  const settled = dropped >= pins.length;
  const mapHeight = rt.screen.height * MAP_SHARE;
  const mapParams = { city, save: save._id };
  const away = useRef(false);
  const fixing = useRef(false);
  useEffect(() => {
    away.current = false;
    return () => {
      away.current = true;
    };
  }, []);
  const done = () => {
    away.current = true;
    removal.leave("done");
    router.replace({ pathname: "/(app)/(tabs)/(map)", params: mapParams });
  };
  const fixPlaces = async () => {
    if (fixing.current) return;
    fixing.current = true;
    try {
      await removal.fix();
      if (away.current || (await editGate.admit()) !== "go" || away.current)
        return;
      editGate.passed();
      removal.leave("fix");
      router.push({
        pathname: "/edit-save-places",
        params: { itemId: save._id },
      });
    } finally {
      fixing.current = false;
    }
  };
  const openCity = () => {
    away.current = true;
    removal.leave("city");
    analytics.capture("share_spots_city_opened", { pin_count: pins.length });
    router.dismissTo({ pathname: "/(app)/(tabs)/(map)", params: mapParams });
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
          visible={dropped}
        />
        <View style={styles.added}>
          <Text style={styles.addedText}>{t("spots.addedTo", { city })}</Text>
        </View>
      </View>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {pins.length > 0
            ? t("spots.count", { count: pins.length })
            : t("spots.noneLeft")}
        </Text>
        <SaveRow item={save} />
        <ScrollView style={styles.rows} accessibilityLiveRegion="polite">
          {pins.map((pin, index) => (
            <SpotRow
              key={`${cityPinId(pin)}:${index < dropped ? "shown" : "waiting"}`}
              pin={pin}
              shown={index < dropped}
              reduced={reduced}
              onRemove={settled ? () => removal.remove(pin) : undefined}
            />
          ))}
          {settled ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void fixPlaces()}
              style={({ pressed }) => [styles.fix, pressed && styles.pressed]}
            >
              <Text style={styles.fixText}>{t("spots.fixPlaces")}</Text>
            </Pressable>
          ) : null}
          {pins.length > 0 ? (
            <AlsoAddTo
              itemId={save._id}
              city={city}
              count={pins.length}
              beforeToggle={removal.flush}
            />
          ) : null}
        </ScrollView>
        <View style={[styles.actions, { paddingBottom: rt.insets.bottom }]}>
          {pins.length > 0 ? (
            <Button title={t("spots.openCity", { city })} onPress={openCity} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={done}
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>{t("common.done")}</Text>
          </Pressable>
        </View>
      </View>
      <UndoBar
        message={
          removal.undo
            ? t("cityMap.removedPlace", { name: removal.undo.name })
            : null
        }
        onUndo={removal.restore}
        raised
      />
    </View>
  );
}

function useLandingHaptics(dropped: number, total: number) {
  const focused = useIsFocused();
  const previous = useRef(0);
  useEffect(() => {
    const landed = dropped > previous.current;
    previous.current = dropped;
    if (!focused || !landed) return;
    void (dropped >= total ? haptics.success() : haptics.landing());
  }, [dropped, total, focused]);
}

function SpotRow({
  pin,
  shown,
  reduced,
  onRemove,
}: {
  pin: CityPin;
  shown: boolean;
  reduced: boolean;
  onRemove?: () => void;
}) {
  const { theme } = useUnistyles();
  const category = placeCategoryLabel(pin.category);
  const row = (
    <>
      <PinBadge number={pin.number} day={0} />
      <View style={styles.spotText}>
        <Text style={styles.spotName}>{pin.name}</Text>
        {category ? <Text style={styles.category}>{category}</Text> : null}
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("spots.removePlace", { name: pin.name })}
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="xmark"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      ) : null}
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
  remove: {
    width: 44,
    height: 44,
    marginVertical: -theme.gap(1.25),
    alignItems: "center",
    justifyContent: "center",
  },
  fix: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(1.5),
  },
  fixText: {
    ...theme.type.subheadLabel,
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
