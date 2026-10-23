import { t, useAppLocale } from "@/lib/i18n";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CtaButton } from "@/components/onboarding/parts";
import type { Goal } from "@/lib/onboarding-goals";
import type { EveningAfter } from "@/lib/sample-trip";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const DATE_PICKS = {
  walk: "promise.datePickWalk",
  drinks: "promise.datePickDrinks",
  dessert: "promise.datePickDessert",
} as const;

/** The headline and the three promises for each answer to "What do you save?". */
function promiseCopy(goal: Goal, city: string | null, after: EveningAfter) {
  switch (goal) {
    case "travel":
      return {
        title:
          city === null
            ? t("promise.travelTitleAnywhere")
            : t("promise.travelTitle", { city }),
        accent: t("promise.travelAccent"),
        lines: [
          city === null
            ? t("promise.travelSaveAnywhere")
            : t("promise.travelSave", { city }),
          t("promise.travelPick"),
          t("promise.travelGo"),
        ],
      };
    case "food":
      return {
        title: t("promise.noMore"),
        accent: t("promise.foodAccent"),
        lines: [
          city === null
            ? t("promise.foodSaveAnywhere")
            : t("promise.foodSave", { city }),
          t("promise.foodPick"),
          t("promise.foodGo"),
        ],
      };
    case "date":
      return {
        title: t("promise.noMore"),
        accent: t("promise.dateAccent"),
        lines: [
          t("promise.dateSave"),
          t(DATE_PICKS[after]),
          t("promise.dateGo"),
        ],
      };
    case "recipes":
      return {
        title: t("promise.noMore"),
        accent: t("promise.recipesAccent"),
        lines: [
          t("promise.recipesSave"),
          t("promise.recipesPick"),
          t("promise.recipesGo"),
        ],
      };
    case "other":
      return {
        title: t("promise.noMore"),
        accent: t("promise.otherAccent"),
        lines: [
          t("promise.otherSave"),
          t("promise.otherPick"),
          t("promise.otherGo"),
        ],
      };
  }
}

export function PromiseStep({
  goal,
  city,
  after = "walk",
  leaving,
  onCommit,
}: {
  goal: Goal;
  /** null when the person picked no city we cover. */
  city: string | null;
  /** What follows dinner on the date night they picked. */
  after?: EveningAfter;
  leaving: boolean;
  onCommit: () => void;
}) {
  useAppLocale();
  const copy = promiseCopy(goal, city, after);
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {copy.title} <Text style={styles.headlineAccent}>{copy.accent}</Text>
      </Text>

      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t("promise.eyebrow")}</Text>
        {copy.lines.map((line, index) => (
          <View
            key={index}
            style={[styles.line, index > 0 && styles.lineDivided]}
          >
            <Text style={styles.number}>{index + 1}</Text>
            <Text style={styles.lineText}>{line}</Text>
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
    gap: theme.gap(2.5),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 36,
    color: theme.colors.foreground,
  },
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  card: {
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2.25),
    paddingBottom: theme.gap(1),
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
    paddingVertical: theme.gap(1.75),
  },
  lineDivided: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
    fontSize: 20,
    lineHeight: 25,
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
