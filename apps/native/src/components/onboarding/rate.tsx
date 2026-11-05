import { GhostButton, PillButton } from "@/components/onboarding/parts";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { requestReviewOnce } from "@/lib/review-prompt";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function RateStep({
  leaving,
  onContinue,
}: {
  leaving: boolean;
  onContinue: () => void;
}) {
  useAppLocale();
  const [asked, setAsked] = useState(false);
  const love = () => {
    if (asked) return onContinue();
    analytics.capture("onboarding_rate", { action: "love" });
    setAsked(true);
    void requestReviewOnce();
  };
  const later = () => {
    analytics.capture("onboarding_rate", { action: "later" });
    onContinue();
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.middle}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>🧑‍💻</Text>
        </View>
        <Text
          style={styles.title}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          accessibilityRole="header"
        >
          {t("onboardingRate.title")}
        </Text>
        <Text style={styles.body}>{t("onboardingRate.body")}</Text>
        <Text
          style={styles.stars}
          accessibilityLabel={t("onboardingRate.stars")}
        >
          ★★★★★
        </Text>
      </View>
      <View style={styles.actions}>
        <PillButton
          label={t(asked ? "common.continue" : "onboardingRate.love")}
          onPress={love}
          busy={leaving}
        />
        {asked ? null : (
          <GhostButton
            label={t("onboardingRate.later")}
            onPress={later}
            disabled={leaving}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, gap: theme.gap(1.5) },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 8,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  avatarEmoji: { fontSize: 64, lineHeight: 80 },
  title: {
    ...theme.type.displayTitle,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  body: {
    ...theme.type.body,
    textAlign: "center",
    color: theme.colors.muted,
  },
  stars: { fontSize: 32, letterSpacing: 4, color: theme.colors.primary },
  actions: { alignItems: "center", gap: theme.gap(1) },
}));
