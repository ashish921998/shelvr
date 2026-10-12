import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** "What are you into?": each picked topic becomes a space and leads the
 * first-save picker. Picking none is fine; the step never blocks. */
export function InterestsStep({
  picked,
  onToggle,
  onAdvance,
}: {
  picked: readonly Interest[];
  onToggle: (interest: Interest) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("interests.title")}
        </Text>
        <Text style={styles.support}>{t("interests.help")}</Text>
      </View>

      <View style={styles.chips}>
        {INTERESTS.map((interest) => {
          const active = picked.includes(interest);
          return (
            <Pressable
              key={interest}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggle(interest)}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {onboardingLabel(interest)}
              </Text>
              {active ? (
                <AppSymbolIcon
                  name="checkmark"
                  size={13}
                  tintColor={theme.colors.primary}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.foot}>
        <CtaButton label={t("common.continue")} onPress={onAdvance} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
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
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  chip: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(2),
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  chipLabelActive: {
    color: theme.colors.primaryText,
  },
  foot: {
    marginTop: "auto",
  },
}));
