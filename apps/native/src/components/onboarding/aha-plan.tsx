import { PillButton, QuestionTitle } from "@/components/onboarding/parts";
import { PinBadge } from "@/components/onboarding/sample-trip-map";
import type { AhaSample, AhaSpot } from "@/lib/aha-sample";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { motion, springIn } from "@/lib/motion";
import type { SavedCount } from "@/lib/onboarding-goals";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";
import { SAMPLE_SLOT_LABELS } from "@/lib/sample-trip";
import type { TextMessageKey } from "@/locales/message-types";
import * as Haptics from "expo-haptics";
import { Fragment, useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const TITLES: Record<
  PlanKind,
  "aha.planTitleDate" | "aha.planTitleTrip" | "aha.planTitleWeekend"
> = {
  date: "aha.planTitleDate",
  trip: "aha.planTitleTrip",
  weekend: "aha.planTitleWeekend",
};

const CALLOUTS: Record<SavedCount | "none", TextMessageKey> = {
  few: "aha.calloutFew",
  tenToFifty: "aha.calloutTenToFifty",
  fiftyToTwoHundred: "aha.calloutFiftyToTwoHundred",
  hundreds: "aha.calloutHundreds",
  lostCount: "aha.calloutLostCount",
  none: "aha.calloutNone",
};

function clock(minutes: number): string {
  // 1 January 2023, any day would do.
  const at = new Date(2023, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(formattingLocale(), {
    timeStyle: "short",
  }).format(at);
}

function StopRow({ spot }: { spot: AhaSpot }) {
  return (
    <View style={styles.stop}>
      <PinBadge number={spot.number} day={0} />
      <View style={styles.stopText}>
        <Text style={styles.stopName}>{spot.stop.name}</Text>
        <Text style={styles.stopMeta}>
          {clock(spot.time)} · {t(SAMPLE_SLOT_LABELS[spot.stop.slot])}
        </Text>
      </View>
    </View>
  );
}

export function AhaPlanStep({
  sample,
  savedCount,
  leaving,
  onContinue,
}: {
  sample: AhaSample;
  savedCount: SavedCount | null;
  leaving: boolean;
  onContinue: () => void;
}) {
  useAppLocale();
  const reduced = useReducedMotion();
  const city = t(SAMPLE_CITIES[sample.city].name);
  // The plan card starts in on mount, so the success tap lands with it.
  useEffect(() => {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);
  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <QuestionTitle title={t(TITLES[sample.kind], { city })} />
        <Animated.View entering={springIn(reduced)} style={styles.card}>
          {sample.spots.map((spot) => (
            <Fragment key={spot.number}>
              {spot.walk === null ? null : (
                <View style={styles.walk}>
                  <View style={styles.walkLine} />
                  <Text style={styles.walkText}>
                    {t("aha.walk", { minutes: String(spot.walk) })}
                  </Text>
                </View>
              )}
              <StopRow spot={spot} />
            </Fragment>
          ))}
        </Animated.View>
        <Animated.View
          entering={springIn(reduced, motion.duration.stagger)}
          style={styles.callout}
        >
          <Text style={styles.calloutText}>
            {t(CALLOUTS[savedCount ?? "none"])}
          </Text>
        </Animated.View>
      </ScrollView>
      <PillButton
        label={t("aha.saveYours")}
        onPress={onContinue}
        busy={leaving}
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
    gap: theme.gap(3),
    paddingBottom: theme.gap(2),
  },
  card: {
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  stopText: {
    flex: 1,
    gap: 2,
  },
  stopName: {
    ...theme.type.headline,
    color: theme.colors.foreground,
  },
  stopMeta: {
    ...theme.type.caption,
    color: theme.colors.muted,
  },
  walk: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(2),
    minHeight: 36,
    paddingLeft: 10,
  },
  walkLine: {
    width: 2,
    alignSelf: "stretch",
    borderRadius: 1,
    backgroundColor: theme.colors.border,
  },
  walkText: {
    ...theme.type.label,
    color: theme.colors.muted,
  },
  callout: {
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  calloutText: {
    ...theme.type.body,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
}));
