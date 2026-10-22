import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const FADE_HEIGHT = 32;

/** Travel is its own goal now, so the topics offer everything else. */
const TOPICS = INTERESTS.filter((interest) => interest !== "Travel");

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
  return (
    <View style={styles.wrap}>
      <View style={styles.scroll}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
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
            {TOPICS.map((interest) => (
              <Chip
                key={interest}
                label={onboardingLabel(interest)}
                active={picked.includes(interest)}
                onPress={() => onToggle(interest)}
              />
            ))}
          </View>
        </ScrollView>
        <View pointerEvents="none" style={styles.fade} />
      </View>

      <View style={styles.foot}>
        <CtaButton
          label={t("common.continue")}
          onPress={onAdvance}
          disabled={picked.length === 0}
        />
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
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
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
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
    paddingTop: theme.gap(1),
  },
}));
