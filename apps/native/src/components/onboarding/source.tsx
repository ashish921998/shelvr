import { t, useAppLocale } from "@/lib/i18n";
import {
  acquisitionSourceAnalytics,
  orderAcquisitionSources,
  sourceLabel,
  type AcquisitionSource,
} from "@/lib/acquisition-source";
import { GhostButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Long enough to see the tick land, short enough to read as one tap.
const ADVANCE_DELAY_MS = 220;

/** One tap answers and moves on; "Skip" moves on without an answer. */
export function SourceStep({ onAdvance }: { onAdvance: () => void }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [order] = useState(() => orderAcquisitionSources());
  const [picked, setPicked] = useState<AcquisitionSource | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // A ref, not `picked`: two taps can land before the re-render that would
  // disable the rows, and each must not record its own answer.
  const done = useRef(false);

  const pick = (source: AcquisitionSource, position: number) => {
    if (done.current) return;
    done.current = true;
    setPicked(source);
    if (process.env.EXPO_OS === "ios") Haptics.selectionAsync();
    acquisitionSourceAnalytics.answered(source, position);
    timer.current = setTimeout(onAdvance, ADVANCE_DELAY_MS);
  };

  const skip = () => {
    if (done.current) return;
    done.current = true;
    acquisitionSourceAnalytics.skipped();
    onAdvance();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{t("onboarding.sourceTitle")}</Text>

      <View style={styles.list}>
        {order.map((source, position) => {
          const active = picked === source;
          const label = sourceLabel(source, process.env.EXPO_OS);
          return (
            <Pressable
              key={source}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => pick(source, position)}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {label.kind === "brand" ? label.text : t(label.key)}
              </Text>
              {active ? (
                <AppSymbolIcon
                  name="checkmark"
                  size={14}
                  tintColor={theme.colors.primary}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.foot}>
        <GhostButton label={t("onboarding.sourceSkip")} onPress={skip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  list: {
    gap: theme.gap(1),
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  labelActive: {
    color: theme.colors.primaryText,
  },
  foot: {
    marginTop: "auto",
    paddingTop: theme.gap(2),
  },
}));
