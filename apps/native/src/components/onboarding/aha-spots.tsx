import { PillButton } from "@/components/onboarding/parts";
import { SampleAppleMap } from "@/components/onboarding/sample-apple-map";
import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import type { AhaSample } from "@/lib/aha-sample";
import { t, useAppLocale } from "@/lib/i18n";
import { motion, springIn } from "@/lib/motion";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import { SAMPLE_CROPS } from "@/lib/sample-trip";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

/** Pins dropped so far, one per stagger; all at once under Reduce Motion, where each row only fades in. */
function useDroppedPins(count: number): number {
  const reduced = useReducedMotion();
  const [dropped, setDropped] = useState(reduced ? count : 0);
  useEffect(() => {
    if (dropped >= count) return;
    const timer = setTimeout(
      () => setDropped(reduced ? count : dropped + 1),
      reduced ? 0 : motion.duration.stagger,
    );
    return () => clearTimeout(timer);
  }, [dropped, count, reduced]);
  return dropped;
}

/** The shared reel's spots dropping onto a preview of the city page they land on. */
export function AhaSpotsStep({
  sample,
  onContinue,
}: {
  sample: AhaSample;
  onContinue: () => void;
}) {
  useAppLocale();
  const dropped = useDroppedPins(sample.spots.length);
  const reduced = useReducedMotion();
  const city = t(SAMPLE_CITIES[sample.city].name);
  return (
    <View style={styles.wrap}>
      <View style={styles.map}>
        {process.env.EXPO_OS === "ios" ? (
          <SampleAppleMap trip={sample.trip} visible={dropped} />
        ) : (
          <SampleTripMap
            trip={sample.trip}
            crop={SAMPLE_CROPS.reveal}
            visible={dropped}
          />
        )}
        <View style={styles.added}>
          <Text style={styles.addedText}>{t("aha.addedTo", { city })}</Text>
        </View>
      </View>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">
            {t("aha.cityPlaces", { city })}
          </Text>
          <Text style={styles.credit}>
            {t("aha.fromReel", { handle: sample.creator })}
          </Text>
        </View>
        {/* With large text the rows scroll, after the map has given up its room. */}
        <ScrollView
          style={styles.rows}
          showsVerticalScrollIndicator={false}
          accessibilityLiveRegion="polite"
        >
          {/* Every row takes its room from the start, so the map's size, and its camera, stay put while the pins drop. */}
          {sample.spots.map((spot, index) => {
            const row = (
              <>
                <PinBadge number={index + 1} day={0} />
                <View style={styles.spotText}>
                  <Text style={styles.spotName}>{spot.name}</Text>
                </View>
              </>
            );
            return index < dropped ? (
              <Animated.View
                key={`${spot.name}:shown`}
                entering={springIn(reduced)}
                style={styles.spot}
              >
                {row}
              </Animated.View>
            ) : (
              <View
                key={`${spot.name}:waiting`}
                style={[styles.spot, styles.waiting]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {row}
              </View>
            );
          })}
        </ScrollView>
      </View>
      <PillButton
        label={t("common.continue")}
        onPress={onContinue}
        disabled={dropped < sample.spots.length}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(1.5),
  },
  // The map runs edge to edge under the header, like the city page it previews.
  map: {
    flex: 1,
    minHeight: 160,
    marginTop: -theme.gap(2),
    marginHorizontal: -theme.gap(3),
    overflow: "hidden",
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
    flexShrink: 1,
    marginTop: -theme.gap(3),
    marginHorizontal: -theme.gap(3),
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
  head: {
    gap: theme.gap(0.25),
  },
  rows: {
    flexGrow: 0,
    flexShrink: 1,
  },
  title: {
    ...theme.type.sheetTitle,
    color: theme.colors.foreground,
  },
  credit: {
    ...theme.type.subhead,
    color: theme.colors.muted,
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
    gap: 2,
  },
  spotName: {
    ...theme.type.headline,
    color: theme.colors.foreground,
  },
}));
