import { t, useAppLocale } from "@/lib/i18n";
import {
  acquisitionSourceAnalytics,
  sourceLabel,
  type AcquisitionSource,
} from "@/lib/acquisition-source";
import { GhostButton } from "@/components/onboarding/parts";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { AppSymbolIcon } from "@/components/symbol";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Long enough to see the tick land, short enough to read as one tap.
const ADVANCE_DELAY_MS = 220;

/** One tap answers and moves on; "Skip" moves on without an answer. */
export function SourceStep({
  order,
  correcting,
  onAnswered,
  onAdvance,
}: {
  /** Owned by the screen, so the rows keep their places after going back. */
  order: AcquisitionSource[];
  /** An answer was already recorded on an earlier visit to this step. */
  correcting: boolean;
  onAnswered: () => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
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
    acquisitionSourceAnalytics.answered(source, position, correcting);
    onAnswered();
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
      {/* The headline scrolls with the answers: at the largest text sizes it
          alone can fill most of a small screen. Skip stays pinned below. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("onboarding.sourceTitle")}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("onboarding.sourceTitle")}
          style={styles.list}
        >
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
      </ScrollView>

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
    marginBottom: theme.gap(1),
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  scroll: {
    flex: 1,
  },
  list: {
    gap: theme.gap(1),
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(1.5),
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
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  labelActive: {
    color: theme.colors.primaryText,
  },
  foot: {
    paddingTop: theme.gap(1),
  },
}));
