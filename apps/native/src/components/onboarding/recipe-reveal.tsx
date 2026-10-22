import { CtaButton } from "@/components/onboarding/parts";
import { Head } from "@/components/onboarding/trip-teaser";
import { RecipeSection } from "@/components/recipe-section";
import { AppSymbolIcon } from "@/components/symbol";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { settleIn } from "@/lib/motion";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PHOTO = require("../../../assets/onboarding/demo-recipe.jpg");

const SETTLE_HEAD = settleIn(150);
const SETTLE_CARD = settleIn(450);
const SETTLE_FOOT = settleIn(700);

/** The recipe a recipes goal ends on, shown in the same view a saved recipe gets. */
function sampleRecipe() {
  return {
    servings: "6",
    ingredients: [
      t("recipeReveal.ingredientMince"),
      t("recipeReveal.ingredientOnion"),
      t("recipeReveal.ingredientPassata"),
      t("recipeReveal.ingredientSheets"),
      t("recipeReveal.ingredientWhiteSauce"),
      t("recipeReveal.ingredientMozzarella"),
    ],
    steps: [
      t("recipeReveal.stepSauce"),
      t("recipeReveal.stepLayer"),
      t("recipeReveal.stepBake"),
    ],
  };
}

export function RecipeRevealStep({ onContinue }: { onContinue: () => void }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [leaving, setLeaving] = useState(false);
  const leftRef = useRef(false);
  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    onContinue();
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.scroll}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={SETTLE_HEAD}>
            <Head
              title={t("tripTeaser.revealTitle")}
              accent={t("recipeReveal.accent")}
              body={t("recipeReveal.body")}
            />
          </Animated.View>
          <Animated.View entering={SETTLE_CARD} style={styles.card}>
            <View>
              <Image source={PHOTO} contentFit="cover" style={styles.photo} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("recipeReveal.badge")}</Text>
              </View>
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{t("recipeReveal.name")}</Text>
              <View style={styles.read}>
                <AppSymbolIcon
                  name="play.rectangle"
                  size={15}
                  tintColor={theme.colors.primaryText}
                />
                <Text style={styles.readText}>
                  {t("recipeReveal.fromVideo")}
                </Text>
              </View>
              <RecipeSection recipe={sampleRecipe()} />
            </View>
          </Animated.View>
        </ScrollView>
        <View pointerEvents="none" style={styles.fade} />
      </View>
      <Animated.View style={styles.foot} entering={SETTLE_FOOT}>
        <CtaButton
          label={t("common.continue")}
          onPress={leave}
          busy={leaving}
        />
      </Animated.View>
    </View>
  );
}

const FADE_HEIGHT = 32;

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(3),
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: theme.gap(3),
    paddingBottom: FADE_HEIGHT,
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
    experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
      theme.colors.background,
      0,
    )} 0%, ${theme.colors.background} 100%)`,
  },
  foot: {
    paddingTop: theme.gap(1),
  },
  card: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: 132,
    backgroundColor: theme.colors.primarySoft,
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  badgeText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  body: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
  },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 29,
    color: theme.colors.foreground,
  },
  read: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  readText: {
    flex: 1,
    ...theme.type.caption,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
}));
