import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { SaveSummary } from "@/components/onboarding/save-summary";
import { CtaButton } from "@/components/onboarding/parts";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SaveLater({
  title,
  meta,
  previewed,
  space,
  saving,
  onContinue,
}: {
  title: string;
  meta: string;
  previewed: boolean;
  space: string | null;
  saving: boolean;
  onContinue: () => void;
}) {
  useAppLocale();

  return (
    <View style={styles.wrap}>
      <Text style={styles.verdict} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {previewed ? t("reveal.previewTitle") : t("demo.linkQueued")}{" "}
        <Text style={styles.verdictMuted}>{t("reveal.previewSubtitle")}</Text>
      </Text>

      <SaveSummary image={null} title={title} meta={meta} />

      {space ? (
        <View style={styles.dest}>
          <Text style={styles.destText}>{t("reveal.filedIn", { space })}</Text>
        </View>
      ) : null}

      <View style={styles.foot}>
        <CtaButton
          label={t("common.continue")}
          onPress={onContinue}
          busy={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  verdict: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  verdictMuted: {
    color: theme.colors.muted,
  },
  dest: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  destText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  foot: {
    marginTop: "auto",
  },
}));
