import { GhostButton, PillButton } from "@/components/onboarding/parts";
import { SampleAppleMap } from "@/components/onboarding/sample-apple-map";
import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import { AppSymbolIcon } from "@/components/symbol";
import type { AhaSample } from "@/lib/aha-sample";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { ONBOARDING_FLOW_VERSION } from "@/lib/onboarding-steps";
import { SAMPLE_CITIES } from "@/lib/sample-cities";
import { SAMPLE_CROPS } from "@/lib/sample-trip";
import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { haptics } from "@/lib/haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const HOLD_MS = 1000;
const RING_SIZE = 88;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = RING_CENTER - 3;
const RING = Skia.PathBuilder.Make()
  .addCircle(RING_CENTER, RING_CENTER, RING_RADIUS)
  .detach();

function recordCommitment(sample: AhaSample, action: "confirmed" | "skipped") {
  analytics.capture("onboarding_commitment", {
    action,
    plan_kind: sample.kind,
    sample_city: sample.city,
    flow_version: ONBOARDING_FLOW_VERSION,
  });
}

function useCommitmentHold(sample: AhaSample) {
  const [confirmed, setConfirmed] = useState(false);
  const done = useRef(false);
  const holding = useRef(false);
  const skipped = useRef(false);
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();

  const cancel = useCallback(() => {
    holding.current = false;
    cancelAnimation(progress);
    if (!done.current) progress.set(0);
  }, [progress]);

  const confirm = useCallback(() => {
    if (done.current) return;
    cancel();
    done.current = true;
    progress.set(1);
    setConfirmed(true);
    recordCommitment(sample, "confirmed");
    void haptics.success();
  }, [cancel, progress, sample]);

  const skip = () => {
    cancel();
    if (done.current || skipped.current) return;
    skipped.current = true;
    recordCommitment(sample, "skipped");
  };

  const start = () => {
    if (done.current || AppState.currentState !== "active") return;
    cancel();
    holding.current = true;
    if (!reduced) {
      progress.set(
        withTiming(1, {
          duration: HOLD_MS,
          easing: Easing.linear,
        }),
      );
    }
  };

  const completeHold = () => {
    if (holding.current && AppState.currentState === "active") confirm();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => {
      subscription.remove();
      cancel();
    };
  }, [cancel]);

  return { confirmed, progress, start, cancel, confirm, completeHold, skip };
}

export function CommitmentStep({
  sample,
  leaving,
  onContinue,
}: {
  sample: AhaSample;
  leaving: boolean;
  onContinue: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const hold = useCommitmentHold(sample);
  const city = t(SAMPLE_CITIES[sample.city].name);
  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={styles.eyebrow}>
            {t(hold.confirmed ? "commitment.made" : "commitment.eyebrow")}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {t("commitment.title")}
          </Text>
        </View>
        <View style={styles.card}>
          <View
            style={styles.map}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t("tripTeaser.mapLabel", {
              city,
              places: String(sample.spots.length),
            })}
          >
            {process.env.EXPO_OS === "ios" ? (
              <SampleAppleMap trip={sample.trip} />
            ) : (
              <SampleTripMap trip={sample.trip} crop={SAMPLE_CROPS.reveal} />
            )}
            <View style={styles.cityBadge} pointerEvents="none">
              <Text style={styles.city}>{city}</Text>
            </View>
          </View>
          <View style={styles.spots}>
            {sample.spots.map((spot, index) => (
              <View key={spot.name} style={styles.spot}>
                <PinBadge number={index + 1} day={0} />
                <Text style={styles.spotName}>{spot.name}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.card, styles.promise]}>
          <Text style={styles.eyebrow}>{t("commitment.firstStep")}</Text>
          <Text style={styles.promiseText}>
            {t(sample.kind === "trip" ? "commitment.trip" : "commitment.week", {
              city,
            })}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("commitment.hold")}
          accessibilityHint={t("commitment.holdHint")}
          accessibilityState={{ disabled: hold.confirmed || leaving }}
          disabled={hold.confirmed || leaving}
          onPressIn={hold.start}
          onPressOut={hold.cancel}
          delayLongPress={HOLD_MS}
          onLongPress={hold.completeHold}
          onAccessibilityTap={hold.confirm}
          accessibilityActions={[{ name: "activate" }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === "activate") hold.confirm();
          }}
          style={styles.hold}
          testID="commitment-hold"
        >
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Circle
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              style="stroke"
              strokeWidth={3}
              color={theme.colors.border}
            />
            <Group
              origin={{ x: RING_CENTER, y: RING_CENTER }}
              transform={[{ rotate: -Math.PI / 2 }]}
            >
              <Path
                path={RING}
                start={0}
                end={hold.progress}
                style="stroke"
                strokeWidth={3}
                strokeCap="round"
                color={theme.colors.primary}
              />
            </Group>
          </Canvas>
          <View style={styles.seal}>
            <AppSymbolIcon
              name={hold.confirmed ? "checkmark" : "mappin"}
              size={30}
              weight="bold"
              tintColor={theme.colors.onTint}
            />
          </View>
        </Pressable>
        <Text style={styles.holdLabel} accessibilityLiveRegion="polite">
          {t(hold.confirmed ? "commitment.confirmed" : "commitment.hold")}
        </Text>
        {hold.confirmed ? (
          <PillButton
            label={t("common.continue")}
            onPress={onContinue}
            busy={leaving}
          />
        ) : (
          <View style={styles.alternatives}>
            <GhostButton
              label={t("commitment.tap")}
              onPress={hold.confirm}
              disabled={leaving}
            />
            <GhostButton
              label={t("commitment.later")}
              onPress={() => {
                hold.skip();
                onContinue();
              }}
              disabled={leaving}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, gap: theme.gap(1.5) },
  scroll: { flex: 1 },
  body: { gap: theme.gap(1.5), paddingBottom: theme.gap(1) },
  head: { gap: theme.gap(0.75) },
  eyebrow: {
    ...theme.type.captionLabel,
    color: theme.colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: { ...theme.type.displayTitle, color: theme.colors.foreground },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  map: { height: 176, overflow: "hidden" },
  cityBadge: {
    position: "absolute",
    top: theme.gap(1),
    left: theme.gap(1.5),
    paddingHorizontal: theme.gap(1),
    paddingVertical: theme.gap(0.5),
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  city: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  spots: { paddingHorizontal: theme.gap(1.5), paddingVertical: theme.gap(0.5) },
  spot: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingVertical: theme.gap(0.75),
  },
  spotName: { ...theme.type.subhead, color: theme.colors.foreground, flex: 1 },
  promise: { padding: theme.gap(2), gap: theme.gap(0.75) },
  promiseText: { ...theme.type.largeTitle, color: theme.colors.foreground },
  actions: { alignItems: "center", gap: theme.gap(1), minHeight: 192 },
  hold: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  seal: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  holdLabel: { ...theme.type.bodyLabel, color: theme.colors.foreground },
  alternatives: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.gap(2),
  },
}));
