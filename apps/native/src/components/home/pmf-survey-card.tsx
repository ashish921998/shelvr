import { t, useAppLocale } from "@/lib/i18n";
import { InlineCard } from "@/components/ui/inline-card";
import type { PmfChoice } from "@/lib/pmf-survey";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const CHOICES: { choice: PmfChoice; label: () => string }[] = [
  { choice: "very", label: () => t("home.pmfVery") },
  { choice: "somewhat", label: () => t("home.pmfSomewhat") },
  { choice: "not", label: () => t("home.pmfNot") },
];

/**
 * The product-market-fit question on Home. Purely presentational;
 * lib/pmf-survey.ts owns when it shows and what it records.
 */
export function PmfSurveyCard({
  onAnswer,
  onDismiss,
}: {
  onAnswer: (choice: PmfChoice) => void;
  onDismiss: () => void;
}) {
  useAppLocale();
  return (
    <InlineCard
      testID="pmf-survey-card"
      title={t("home.pmfQuestion")}
      body={t("home.pmfBody")}
    >
      <View style={styles.choices}>
        {CHOICES.map(({ choice, label }) => (
          <Pressable
            key={choice}
            accessibilityRole="button"
            testID={`pmf-${choice}`}
            onPress={() => onAnswer(choice)}
            style={({ pressed }) => [
              styles.choice,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.choiceText}>{label()}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  choices: {
    gap: theme.gap(1),
    marginTop: theme.gap(0.5),
  },
  choice: {
    minHeight: 44,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
  },
  choiceText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
