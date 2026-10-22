import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { CtaButton } from "@/components/onboarding/parts";
import { withAlpha } from "@/lib/color";
import { SampleTripCard } from "@/components/onboarding/trip-teaser-card";
import { AppSymbolIcon } from "@/components/symbol";
import { StitchRing } from "@/components/ui/stitch-loader";
import { t, useAppLocale } from "@/lib/i18n";
import { settleIn } from "@/lib/motion";
import type { SampleCityId, SampleSave } from "@/lib/sample-cities";
import type { SampleTrip } from "@/lib/sample-trip";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BUILD_STEP_COUNT = 4;

const KIND_COPY: Record<
  SampleTrip["kind"],
  {
    title: TextMessageKey;
    accent:
      | "tripTeaser.buildTitleAccent"
      | "plan.buildAccentDate"
      | "plan.buildAccentWeekend";
    plan: TextMessageKey;
    reveal: TextMessageKey;
  }
> = {
  trip: {
    title: "tripTeaser.buildTitle",
    accent: "tripTeaser.buildTitleAccent",
    plan: "tripTeaser.stepPlan",
    reveal: "tripTeaser.revealBody",
  },
  date: {
    title: "plan.buildTitleDate",
    accent: "plan.buildAccentDate",
    plan: "plan.stepPlanDate",
    reveal: "plan.revealBodyDate",
  },
  weekend: {
    title: "plan.buildTitleWeekend",
    accent: "plan.buildAccentWeekend",
    plan: "plan.stepPlanWeekend",
    reveal: "plan.revealBodyWeekend",
  },
};
const STEP_MS = 750;
const HOLD_MS = 500;

const SETTLE_HEAD = settleIn(150);
const SETTLE_CARD = settleIn(450);
const SETTLE_FOOT = settleIn(700);

function Head({
  title,
  accent,
  body,
}: {
  title: string;
  accent?: string;
  body: string;
}) {
  return (
    <View style={styles.head}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {title}
        {accent === undefined ? null : (
          <>
            {" "}
            <Text style={styles.headlineAccent}>{accent}</Text>
          </>
        )}
      </Text>
      <Text style={styles.support}>{body}</Text>
    </View>
  );
}

function SaveRow({
  city,
  save,
  divider,
}: {
  city: SampleCityId;
  save: SampleSave;
  divider: boolean;
}) {
  const { theme } = useUnistyles();
  const source = t(save.source);
  return (
    <View style={[styles.saveRow, divider && styles.divider]}>
      <View style={styles.thumb}>
        {save.picture === "place" ? (
          <AppSymbolIcon
            name="mappin"
            size={22}
            tintColor={theme.colors.primaryText}
          />
        ) : (
          <Image
            source={CITY_PICTURES[city][save.picture]}
            contentFit="cover"
            style={styles.thumbImage}
          />
        )}
      </View>
      <View style={styles.saveText}>
        <Text style={styles.saveTitle} numberOfLines={1}>
          {save.name}
        </Text>
        <Text style={styles.saveSource} numberOfLines={1}>
          {source}
        </Text>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {t("tripTeaser.placeCount", { count: save.places })}
        </Text>
      </View>
    </View>
  );
}

function BuildStepRow({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.buildRow}>
      <View style={styles.mark}>
        {state === "done" ? (
          <View style={styles.markDone}>
            <AppSymbolIcon
              name="checkmark"
              size={12}
              weight="bold"
              tintColor={theme.colors.primaryText}
            />
          </View>
        ) : state === "active" ? (
          <StitchRing size={22} />
        ) : (
          <View style={styles.markPending} />
        )}
      </View>
      <Text
        style={[
          styles.buildLabel,
          state === "active" && styles.buildLabelActive,
          state === "pending" && styles.buildLabelPending,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function TripBuildStep({
  trip,
  onDone,
}: {
  trip: SampleTrip;
  onDone: () => void;
}) {
  useAppLocale();
  const saves = String(trip.saves.length);
  const steps = [
    t("tripTeaser.stepRead", { saves }),
    t("tripTeaser.stepFind"),
    t("tripTeaser.stepPin"),
    t(KIND_COPY[trip.kind].plan),
  ];
  const [finished, setFinished] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const building = finished < BUILD_STEP_COUNT;
    const timer = setTimeout(
      () => (building ? setFinished(finished + 1) : doneRef.current()),
      building ? STEP_MS : HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [finished]);

  return (
    <View style={styles.wrap}>
      <Head
        title={t(KIND_COPY[trip.kind].title)}
        accent={t(KIND_COPY[trip.kind].accent, { city: t(trip.name) })}
        body={t("tripTeaser.buildBody", { saves })}
      />
      <View style={styles.card}>
        {trip.saves.map((save, index) => (
          <SaveRow
            key={save.name}
            city={trip.city}
            save={save}
            divider={index > 0}
          />
        ))}
      </View>
      <View style={styles.buildList} accessibilityLiveRegion="polite">
        {steps.map((label, index) => (
          <BuildStepRow
            key={index}
            label={label}
            state={
              index < finished
                ? "done"
                : index === finished
                  ? "active"
                  : "pending"
            }
          />
        ))}
      </View>
      <Text style={[styles.note, styles.noteBottom]}>
        {t("tripTeaser.buildNote")}
      </Text>
    </View>
  );
}

export function TripRevealStep({
  trip,
  onContinue,
}: {
  trip: SampleTrip;
  onContinue: () => void;
}) {
  useAppLocale();
  const [leaving, setLeaving] = useState(false);
  const leftRef = useRef(false);
  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    onContinue();
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.scroll}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={SETTLE_HEAD}>
            <Head
              title={t("tripTeaser.revealTitle")}
              body={t(KIND_COPY[trip.kind].reveal)}
            />
          </Animated.View>
          <Animated.View entering={SETTLE_CARD}>
            <SampleTripCard trip={trip} />
          </Animated.View>
        </ScrollView>
        <View pointerEvents="none" style={styles.fade} />
      </View>
      <Animated.View style={styles.revealFoot} entering={SETTLE_FOOT}>
        <CtaButton
          label={t("common.continue")}
          onPress={leave}
          busy={leaving}
        />
      </Animated.View>
    </View>
  );
}

const FADE_HEIGHT = 32;

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: theme.gap(3),
    paddingBottom: FADE_HEIGHT,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
    experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
      theme.colors.background,
      0,
    )} 0%, ${theme.colors.background} 100%)`,
  },
  revealFoot: {
    paddingTop: theme.gap(1),
  },
  wrap: {
    flex: 1,
    gap: theme.gap(3),
  },
  head: {
    gap: theme.gap(1),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  support: {
    ...theme.type.subhead,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  card: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  saveText: {
    flex: 1,
    gap: 2,
  },
  saveTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  saveSource: {
    ...theme.type.caption,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceMuted,
  },
  pillText: {
    ...theme.type.label,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  buildList: {
    gap: 14,
    paddingHorizontal: theme.gap(0.5),
  },
  buildRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  mark: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  markDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  markPending: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: `${theme.colors.muted}66`,
  },
  buildLabel: {
    flex: 1,
    ...theme.type.subhead,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  buildLabelActive: {
    fontFamily: theme.fonts.medium,
  },
  buildLabelPending: {
    color: theme.colors.muted,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  note: {
    ...theme.type.caption,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.muted,
  },
  noteBottom: {
    marginTop: "auto",
  },
}));
