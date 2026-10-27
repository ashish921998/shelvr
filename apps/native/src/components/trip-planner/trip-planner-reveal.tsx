import { AppSymbolIcon } from "@/components/symbol";
import { StitchRing } from "@/components/ui/stitch-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { fadeIn, riseIn } from "@/lib/motion";
import { REVEAL_STEPS, revealDelay } from "@/lib/trip-planner";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  city: string;
  /** The trip is made: the remaining lines tick through, then `onDone` runs. */
  ready: boolean;
  onDone: () => void;
};

/** Three lines that check off while the planner works, so the wait reads as progress. */
export function TripPlannerReveal({ city, ready, onDone }: Props) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [step, setStep] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const delay = revealDelay(step, ready);
    if (delay === null) return;
    const timer = setTimeout(() => {
      if (step >= REVEAL_STEPS.length) done.current();
      else setStep(step + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [step, ready]);

  return (
    <Animated.View entering={fadeIn} style={styles.wrap}>
      <ThemedText
        variant="sheetTitle"
        style={styles.title}
        accessibilityRole="header"
      >
        {t("tripPlanner.revealTitle", { city })}
      </ThemedText>
      <View style={styles.steps}>
        {REVEAL_STEPS.slice(0, step + 1).map((key, index) => {
          const finished = index < step;
          return (
            <Animated.View key={key} entering={riseIn} style={styles.step}>
              <View style={styles.indicator}>
                {finished ? (
                  <AppSymbolIcon
                    name="checkmark.circle.fill"
                    size={20}
                    tintColor={theme.colors.primary}
                  />
                ) : (
                  <StitchRing size={18} />
                )}
              </View>
              <ThemedText
                variant="subheadLabel"
                style={finished ? styles.finished : undefined}
                accessibilityLiveRegion={finished ? undefined : "polite"}
              >
                {t(key)}
              </ThemedText>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    justifyContent: "center",
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(3),
    paddingBottom: theme.gap(8),
  },
  title: { textAlign: "center" },
  steps: {
    alignSelf: "center",
    gap: theme.gap(1.75),
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  indicator: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  finished: { color: theme.colors.muted },
}));
