import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { CtaButton } from "@/components/onboarding/parts";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const STEPS: { titleKey: TextMessageKey; helpKey?: TextMessageKey }[] = [
  { titleKey: "home.howToShare" },
  { titleKey: "home.howToPick" },
  { titleKey: "home.howToMore", helpKey: "home.howToMoreHelp" },
];

/** Shown on Home until the first share-sheet save lands. */
export function SaveHowTo() {
  useAppLocale();
  const router = useRouter();

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("home.howToTitle")}</Text>
        <Text style={styles.body}>{t("home.howToBody")}</Text>
      </View>
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.titleKey} style={styles.step}>
            <View style={styles.number}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{t(step.titleKey)}</Text>
              {step.helpKey ? (
                <Text style={styles.stepHelp}>{t(step.helpKey)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      <CtaButton
        label={t("home.pasteLink")}
        onPress={() => router.push("/add")}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(2),
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  head: {
    gap: theme.gap(0.5),
  },
  title: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  steps: {
    gap: theme.gap(1.5),
  },
  step: {
    flexDirection: "row",
    gap: theme.gap(1.5),
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  stepText: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  stepTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  stepHelp: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
}));
