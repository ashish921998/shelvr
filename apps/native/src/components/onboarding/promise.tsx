import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton, FeatureRow } from "@/components/onboarding/parts";
import { Wordmark } from "@/components/wordmark";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

// Step 1 — the value promise. Reuses the three FeatureRows the v1 single-screen
// flow shipped with verbatim (same copy + icons), promoted to the hero position.
// One screen, not a carousel — the survey carries the momentum from here.
export function PromiseStep({ onAdvance }: { onAdvance: () => void }) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <Wordmark size={44} />
        <Text style={styles.slogan}>{t("brand.tagline")}</Text>
      </Animated.View>

      <View style={styles.features}>
        <FeatureRow
          delay={150}
          icon="square.grid.2x2"
          title={t("onboarding.feedTitle")}
          message={t("onboarding.feedBody")}
        />
        <FeatureRow
          delay={280}
          icon="sparkles"
          title={t("onboarding.tagsTitle")}
          message={t("onboarding.tagsBody")}
        />
        <FeatureRow
          delay={410}
          icon="doc.text"
          title={t("onboarding.readerTitle")}
          message={t("onboarding.readerBody")}
        />
      </View>

      <Animated.View entering={FadeInDown.delay(540).duration(400)}>
        <CtaButton label={t("onboarding.getStarted")} onPress={onAdvance} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    gap: theme.gap(4),
  },
  hero: {
    alignItems: "center",
    gap: theme.gap(1),
  },
  slogan: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.muted,
  },
  features: {
    gap: theme.gap(2.5),
  },
}));
