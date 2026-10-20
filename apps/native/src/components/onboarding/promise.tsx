import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton } from "@/components/onboarding/parts";
import type { TextMessageKey } from "@/locales/message-types";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// Sharing and the reminder each had their own step, so the promise names
// neither.
const LINES: TextMessageKey[] = ["promise.comeBack", "promise.use"];

/**
 * The last step before the paywall: two habits the person promises
 * themselves, taken with one tap. Nothing is stored or sent.
 */
export function PromiseStep({
  leaving,
  onCommit,
}: {
  /** `onCommit` ran and the paywall is on its way. */
  leaving: boolean;
  onCommit: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("promise.title")}{" "}
          <Text style={styles.headlineAccent}>{t("promise.titleAccent")}</Text>
        </Text>
        <Text style={styles.support}>{t("promise.body")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t("promise.eyebrow")}</Text>
        {LINES.map((line, index) => (
          <View key={line} style={styles.line}>
            <Text style={styles.number}>{index + 1}</Text>
            <Text style={styles.lineText}>{t(line)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.foot}>
        <CtaButton label={t("promise.cta")} onPress={onCommit} busy={leaving} />
        <Text style={styles.note}>{t("promise.note")}</Text>
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
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  card: {
    gap: theme.gap(1.75),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  line: {
    flexDirection: "row",
    gap: theme.gap(1.5),
  },
  number: {
    width: 14,
    paddingTop: 5,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  lineText: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 21,
    lineHeight: 27,
    color: theme.colors.foreground,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  note: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.muted,
  },
}));
