import type { Recipe } from "@convex/model/itemFields";
import { t, useAppLocale } from "@/lib/i18n";
import { InkCheckbox, StepNumberRing } from "@/components/ink/ink-checkbox";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Recipe markup often states the yield as a bare number ("4"); a phrase
 * ("Makes 16 cookies", "2 1/2 cups") is shown as written. */
function servingsLabel(servings: string): string {
  const count = Number(servings);
  return /^\d+$/.test(servings.trim()) && count > 0
    ? t("recipe.serves", { count })
    : servings;
}

// The structured recipe lifted out of a recipe page, a video caption, or a
// screenshot. Rendered instead of the article paragraphs: the user wants the
// recipe itself, not the blog story around it. Lists are selectable so
// quantities can be copied.
export function RecipeSection({ recipe }: { recipe: Recipe }) {
  useAppLocale();
  // Ticking an ingredient off is local to reading the recipe; it is not a
  // property of the save, so it is not written back.
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const toggle = (index: number) =>
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  return (
    <View style={styles.section}>
      {recipe.servings ? (
        <Text style={styles.servings}>{servingsLabel(recipe.servings)}</Text>
      ) : null}

      <Text style={styles.sectionTitle}>{t("recipe.ingredients")}</Text>
      <View style={styles.list}>
        {recipe.ingredients.map((ingredient, index) => (
          <Pressable
            key={index}
            style={styles.ingredientRow}
            onPress={() => toggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: checked.has(index) }}
            accessibilityLabel={ingredient}
          >
            <InkCheckbox size={18} done={checked.has(index)} seed={index} />
            <Text
              selectable
              style={[
                styles.ingredient,
                checked.has(index) && styles.ingredientDone,
              ]}
            >
              {ingredient}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t("recipe.steps")}</Text>
      <View style={styles.list}>
        {recipe.steps.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepRing}>
              <StepNumberRing size={26} seed={index} />
              <Text style={styles.stepNumber} numberOfLines={1}>
                {String(index + 1)}
              </Text>
            </View>
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
    alignItems: "center",
    minHeight: 40,
  },
  ingredientDone: { color: theme.colors.muted },
  // The ring is drawn behind the numeral rather than around it, so the number
  // stays on the text baseline.
  stepRing: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
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
    position: "absolute",
    fontFamily: theme.fonts.medium,
    fontSize: 13,
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
