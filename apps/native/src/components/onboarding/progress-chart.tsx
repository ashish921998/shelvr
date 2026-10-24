import { PillButton } from "@/components/onboarding/parts";
import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { PlanKind } from "@/lib/sample-plans";
import type { TextMessageKey } from "@/locales/message-types";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Line,
  Path,
  Skia,
} from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const COPY: Record<
  PlanKind,
  { accent: TextMessageKey; goal: TextMessageKey; when: TextMessageKey }
> = {
  date: {
    accent: "onboardingChart.accentDate",
    goal: "onboardingChart.goalDate",
    when: "onboardingChart.whenWeekend",
  },
  trip: {
    accent: "onboardingChart.accentTrip",
    goal: "onboardingChart.goalTrip",
    when: "onboardingChart.whenTrip",
  },
  weekend: {
    accent: "onboardingChart.accentWeekend",
    goal: "onboardingChart.goalWeekend",
    when: "onboardingChart.whenWeekend",
  },
};

const HEIGHT = 230;
const BASELINE = HEIGHT - 30;
const GRID = [0.25, 0.48, 0.71].map((at) => at * BASELINE);
const DRAW_MS = 1100;
// The labels sit on fixed points of the curve, so they stay one line and stop
// growing past this scale; VoiceOver reads them from the chart's own label.
const LABEL_FIT = {
  numberOfLines: 1,
  adjustsFontSizeToFit: true,
  maxFontSizeMultiplier: 1.3,
} as const;
// Splits the translated title around the accent, whatever the word order.
const ACCENT_MARK = "⁣";

function chartPoints(width: number) {
  return {
    start: { x: width * 0.14, y: BASELINE * 0.71 },
    end: { x: width * 0.84, y: BASELINE * 0.25 },
  };
}

function ChartTitle({ kind }: { kind: PlanKind }) {
  const [before = "", after = ""] = t("onboardingChart.title", {
    accent: ACCENT_MARK,
  }).split(ACCENT_MARK);
  return (
    <Text
      style={styles.title}
      maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
      accessibilityRole="header"
    >
      {before}
      <Text style={styles.accent}>{t(COPY[kind].accent)}</Text>
      {after}
    </Text>
  );
}

/** A curve from saves lost in the camera roll to the plan the person picked, drawn once on arrival. */
function Chart({ kind }: { kind: PlanKind }) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduced ? 1 : 0);
  const { start, end } = chartPoints(width);

  const { curve, area } = useMemo(() => {
    const c1 = { x: width * 0.45, y: start.y - 4 };
    const c2 = { x: width * 0.7, y: BASELINE * 0.6 };
    const svgCurve = `M${start.x} ${start.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    return {
      curve: Skia.Path.MakeFromSVGString(svgCurve),
      area: Skia.Path.MakeFromSVGString(
        `${svgCurve} L${end.x} ${BASELINE} L${start.x} ${BASELINE} Z`,
      ),
    };
  }, [width, start.x, start.y, end.x, end.y]);

  useEffect(() => {
    if (width === 0 || reduced) return;
    progress.value = withTiming(1, {
      duration: DRAW_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [width, reduced, progress]);

  const areaOpacity = useDerivedValue(() =>
    interpolate(progress.value, [0.4, 1], [0, 1], "clamp"),
  );
  const endOpacity = useDerivedValue(() =>
    interpolate(progress.value, [0.85, 1], [0, 1], "clamp"),
  );

  const goal = t(COPY[kind].goal);
  const lost = t("onboardingChart.lost");
  return (
    <View
      style={styles.chart}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("onboardingChart.chartLabel", { lost, goal })}
    >
      {width > 0 && curve && area ? (
        <>
          <Canvas style={StyleSheet.absoluteFill}>
            {[...GRID, BASELINE].map((y) => (
              <Line
                key={y}
                p1={{ x: 0, y }}
                p2={{ x: width, y }}
                color={theme.colors.border}
                strokeWidth={1}
              />
            ))}
            <Path
              path={area}
              color={theme.colors.primarySoft}
              opacity={areaOpacity}
            />
            <Line
              p1={{ x: start.x, y: start.y + 8 }}
              p2={{ x: start.x, y: BASELINE }}
              color={theme.colors.danger}
              strokeWidth={1.5}
            >
              <DashPathEffect intervals={[3, 4]} />
            </Line>
            <Line
              p1={{ x: end.x, y: end.y + 8 }}
              p2={{ x: end.x, y: BASELINE }}
              color={theme.colors.primaryText}
              strokeWidth={1.5}
              opacity={endOpacity}
            >
              <DashPathEffect intervals={[4, 4]} />
            </Line>
            <Path
              path={curve}
              color={theme.colors.primary}
              style="stroke"
              strokeWidth={4}
              strokeCap="round"
              start={0}
              end={progress}
            />
            <Circle
              cx={start.x}
              cy={start.y}
              r={6}
              color={theme.colors.danger}
            />
            <Circle
              cx={end.x}
              cy={end.y}
              r={7}
              color={theme.colors.primaryText}
              opacity={endOpacity}
            />
          </Canvas>
          <View
            style={[
              styles.pill,
              styles.lostPill,
              { bottom: HEIGHT - start.y + 14 },
            ]}
          >
            <Text style={styles.pillText} {...LABEL_FIT}>
              {lost}
            </Text>
          </View>
          <Animated.View
            entering={reduced ? undefined : FadeIn.delay(DRAW_MS * 0.85)}
            style={[
              styles.pill,
              styles.goalPill,
              { bottom: HEIGHT - end.y + 14 },
            ]}
          >
            <Text style={styles.pillText} {...LABEL_FIT}>
              {goal}
            </Text>
          </Animated.View>
          <Text
            style={[styles.axis, styles.now, { left: start.x - 14 }]}
            {...LABEL_FIT}
          >
            {t("onboardingChart.now")}
          </Text>
          <Text
            style={[styles.axis, styles.when, { right: width - end.x - 14 }]}
            {...LABEL_FIT}
          >
            {t(COPY[kind].when)}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function ProgressChartStep({
  kind,
  onContinue,
}: {
  kind: PlanKind;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <View style={styles.body}>
        <ChartTitle kind={kind} />
        <Chart kind={kind} />
        <Text style={styles.copy}>{t("onboardingChart.body")}</Text>
      </View>
      <PillButton
        label={t("common.continue")}
        onPress={onContinue}
        testID="onboarding-chart-continue"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(1.5),
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: theme.gap(3),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  accent: {
    color: theme.colors.primaryText,
  },
  chart: {
    height: HEIGHT,
  },
  pill: {
    position: "absolute",
    maxWidth: "48%",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
  },
  lostPill: {
    left: 0,
    backgroundColor: theme.colors.danger,
  },
  goalPill: {
    right: 0,
    backgroundColor: theme.colors.primaryText,
  },
  pillText: {
    ...theme.type.subheadLabel,
    color: theme.colors.background,
  },
  axis: {
    ...theme.type.subheadLabel,
    position: "absolute",
    top: BASELINE + 8,
  },
  now: {
    color: theme.colors.danger,
  },
  when: {
    color: theme.colors.primaryText,
  },
  copy: {
    ...theme.type.subhead,
    lineHeight: 22,
    textAlign: "center",
    color: theme.colors.muted,
    paddingHorizontal: theme.gap(1),
  },
}));
