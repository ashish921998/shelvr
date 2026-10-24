import { AhaReel } from "@/components/onboarding/aha-reel";
import { PillButton, QuestionTitle } from "@/components/onboarding/parts";
import { SampleAppleMap } from "@/components/onboarding/sample-apple-map";
import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import type { AhaSample } from "@/lib/aha-sample";
import { t, useAppLocale } from "@/lib/i18n";
import { motion, springIn } from "@/lib/motion";
import type { SampleSlot } from "@/lib/sample-cities";
import { SAMPLE_CROPS } from "@/lib/sample-trip";
import type { TextMessageKey } from "@/locales/message-types";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const SLOT_QUOTES: Record<SampleSlot, TextMessageKey> = {
  coffee: "aha.quoteCoffee",
  morning: "aha.quoteMorning",
  brunch: "aha.quoteBrunch",
  lunch: "aha.quoteLunch",
  afternoon: "aha.quoteAfternoon",
  dinner: "aha.quoteDinner",
  drinks: "aha.quoteDrinks",
  dessert: "aha.quoteDessert",
  walk: "aha.quoteWalk",
};

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
  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <AhaReel sample={sample} thumb />
          <View style={styles.headText}>
            <QuestionTitle
              title={t("aha.spotsTitle")}
              body={t("aha.spotsBody")}
            />
          </View>
        </View>
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
        </View>
        <View style={styles.list} accessibilityLiveRegion="polite">
          {sample.spots.slice(0, dropped).map((spot) => (
            <Animated.View
              key={spot.number}
              entering={springIn(reduced)}
              style={styles.spot}
            >
              <PinBadge number={spot.number} day={0} />
              <View style={styles.spotText}>
                <Text style={styles.spotName}>{spot.stop.name}</Text>
                <Text style={styles.quote}>
                  {t("aha.quoted", { quote: t(SLOT_QUOTES[spot.stop.slot]) })}
                </Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  body: {
    gap: theme.gap(2.5),
    paddingBottom: theme.gap(2),
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
  },
  headText: {
    flex: 1,
  },
  map: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  list: {
    gap: theme.gap(2),
  },
  spot: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
  },
  spotText: {
    flex: 1,
    gap: 2,
  },
  spotName: {
    ...theme.type.headline,
    color: theme.colors.foreground,
  },
  quote: {
    ...theme.type.subhead,
    lineHeight: 21,
    fontStyle: "italic",
    color: theme.colors.muted,
  },
}));
