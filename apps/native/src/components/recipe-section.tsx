import type { Recipe } from "@convex/model/itemFields";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { isDarkThemeName } from "@/lib/appearance";
import { t, useAppLocale } from "@/lib/i18n";
import { useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// What the model writes when a post never says how many it serves. Saves made
// before the prompt asked it to leave the field out still carry these.
const NO_YIELD =
  /^(not (specified|stated|mentioned|given)|unspecified|unknown|n\/?a|none|-)\.?$/i;

/** Recipe markup often states the yield as a bare number ("4"); a phrase
 * ("Makes 16 cookies", "2 1/2 cups") is shown as written. A placeholder for a
 * missing yield ("not specified") is not shown at all. */
function servingsLabel(servings: string | undefined): string | null {
  const text = servings?.trim();
  if (!text || NO_YIELD.test(text)) return null;
  const count = Number(text);
  return /^\d+$/.test(text) && count > 0 ? t("recipe.serves", { count }) : text;
}

const INGREDIENTS = 0;
const DIRECTIONS = 1;

// The structured recipe lifted out of a recipe page, a video caption, or a
// screenshot. Rendered instead of the article paragraphs: the user wants the
// recipe itself, not the blog story around it. Ingredients and directions sit
// behind the platform's own segmented control, so the method is one tap away
// instead of below every ingredient. Lists are selectable so quantities can be
// copied.
export function RecipeSection({ recipe }: { recipe: Recipe }) {
  useAppLocale();
  const { theme, rt } = useUnistyles();
  const [tab, setTab] = useState(INGREDIENTS);
  const servings = servingsLabel(recipe.servings);
  return (
    <View style={styles.section}>
      {servings ? <Text style={styles.servings}>{servings}</Text> : null}

      <SegmentedControl
        values={[t("recipe.ingredients"), t("recipe.steps")]}
        selectedIndex={tab}
        onChange={(event) => setTab(event.nativeEvent.selectedSegmentIndex)}
        appearance={isDarkThemeName(rt.themeName) ? "dark" : "light"}
        tintColor={theme.colors.primarySoft}
      />

      {tab === DIRECTIONS ? (
        <View style={styles.list}>
          {recipe.steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <Text style={styles.stepLabel}>
                {t("recipe.stepNumber", { number: String(index + 1) })}
              </Text>
              <Text selectable style={styles.body}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.list}>
          {recipe.ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientRow}>
              <View style={styles.bullet} />
              <Text selectable style={styles.body}>
                {ingredient}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.gap(2),
  },
  servings: {
    ...theme.type.label,
    color: theme.colors.muted,
  },
  list: {
    gap: theme.gap(1.5),
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
  step: {
    gap: theme.gap(0.5),
  },
  stepLabel: {
    ...theme.type.captionStrong,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  body: {
    flexShrink: 1,
    ...theme.type.subhead,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
}));
