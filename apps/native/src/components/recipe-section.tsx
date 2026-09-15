import type { Recipe } from "@convex/model/itemFields";
import { t, useAppLocale } from "@/lib/i18n";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// The structured recipe the classifier lifted out of a recipe page. Rendered
// instead of the article paragraphs: the user wants the recipe itself, not
// the blog story around it. Lists are selectable so quantities can be copied.
export function RecipeSection({ recipe }: { recipe: Recipe }) {
  useAppLocale();
  return (
    <View style={styles.section}>
      {recipe.servings ? (
        <Text style={styles.servings}>{recipe.servings}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>{t("recipe.ingredients")}</Text>
      <View style={styles.list}>
        {recipe.ingredients.map((ingredient, index) => (
          <View key={index} style={styles.ingredientRow}>
            <View style={styles.bullet} />
            <Text selectable style={styles.ingredient}>
              {ingredient}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t("recipe.steps")}</Text>
      <View style={styles.list}>
        {recipe.steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <Text style={styles.stepNumber} numberOfLines={1}>
              {String(index + 1)}
            </Text>
            <Text selectable style={styles.step}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.gap(2),
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    padding: theme.gap(2),
  },
  servings: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  sectionTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  list: {
    gap: theme.gap(1.25),
  },
  ingredientRow: {
    flexDirection: "row",
    gap: theme.gap(1),
    alignItems: "flex-start",
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.faint,
    marginTop: 9,
    flexShrink: 0,
  },
  ingredient: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
  stepRow: {
    flexDirection: "row",
    gap: theme.gap(1),
    alignItems: "flex-start",
  },
  stepNumber: {
    minWidth: 20,
    flexShrink: 0,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
    color: theme.colors.primaryText,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 10,
    overflow: "hidden",
  },
  step: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
}));
