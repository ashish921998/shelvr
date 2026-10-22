import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SubmissionRecovery({
  onKeepWaiting,
  onContinue,
}: {
  onKeepWaiting: () => void;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("demo.submissionTitle")}
      </Text>
      <Text style={styles.description}>{t("demo.submissionUnconfirmed")}</Text>
      <View style={styles.actions}>
        <CtaButton label={t("demo.keepWaiting")} onPress={onKeepWaiting} />
        <GhostButton label={t("common.continue")} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, justifyContent: "center", gap: theme.gap(2) },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  actions: { gap: theme.gap(1.5) },
}));
