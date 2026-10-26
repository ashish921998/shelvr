import { StitchRing } from "@/components/ui/stitch-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const STEP_MS = 1800;
const STEPS: TextMessageKey[] = [
  "trip.buildingRead",
  "trip.buildingFind",
  "trip.buildingGroup",
];

export function useBuildStep(): TextMessageKey {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      STEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return STEPS[step];
}

export function TripBuilding() {
  useAppLocale();
  const step = useBuildStep();

  return (
    <View style={styles.wrap}>
      <StitchRing size={28} />
      <ThemedText
        variant="subheadLabel"
        style={styles.muted}
        accessibilityLiveRegion="polite"
      >
        {t(step)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    alignItems: "center",
    gap: theme.gap(2),
    paddingVertical: theme.gap(4),
  },
  muted: {
    color: theme.colors.muted,
  },
}));
