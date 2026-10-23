import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import {
  GOALS,
  GOAL_PLANS,
  type Goal,
  type PlacesGoal,
} from "@/lib/onboarding-goals";
import { SAMPLE_CITIES, type SampleCityId } from "@/lib/sample-cities";
import { planCities } from "@/lib/sample-plans";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import type { TextMessageKey } from "@/locales/message-types";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const GOAL_COPY: Record<
  Goal,
  { title: TextMessageKey; body: TextMessageKey; image: number }
> = {
  travel: {
    title: "goal.travel",
    body: "goal.travelBody",
    image: require("../../../assets/onboarding/demo-travel.jpg"),
  },
  food: {
    title: "goal.food",
    body: "goal.foodBody",
    image: require("../../../assets/onboarding/ramen.jpg"),
  },
  date: {
    title: "goal.date",
    body: "goal.dateBody",
    image: require("../../../assets/onboarding/city-paris-view.jpg"),
  },
  recipes: {
    title: "goal.recipes",
    body: "goal.recipesBody",
    image: require("../../../assets/onboarding/demo-recipe.jpg"),
  },
  other: {
    title: "goal.other",
    body: "goal.otherBody",
    image: require("../../../assets/onboarding/book.jpg"),
  },
};

const CITY_TITLES: Record<PlacesGoal, TextMessageKey> = {
  travel: "goal.cityTravel",
  food: "goal.cityFood",
  date: "goal.cityDate",
};

const CITY_HELP: Record<PlacesGoal, TextMessageKey> = {
  travel: "goal.cityHelpTravel",
  food: "goal.cityHelpFood",
  date: "goal.cityHelpDate",
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function Head({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {title}
      </Text>
      <Text style={styles.support}>{body}</Text>
    </View>
  );
}

function Option({
  label,
  body,
  image,
  active,
  onPress,
}: {
  label: string;
  body?: string;
  image?: number;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        active && styles.optionActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      {image === undefined ? null : (
        <Image source={image} contentFit="cover" style={styles.thumb} />
      )}
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        {body === undefined ? null : (
          <Text style={styles.optionBody}>{body}</Text>
        )}
      </View>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

export function GoalStep({
  goal,
  onPick,
}: {
  goal: Goal | null;
  onPick: (goal: Goal) => void;
}) {
  useAppLocale();
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <Head title={t("goal.title")} body={t("goal.help")} />
      <View style={styles.list}>
        {GOALS.map((option) => (
          <Option
            key={option}
            label={t(GOAL_COPY[option].title)}
            body={t(GOAL_COPY[option].body)}
            image={GOAL_COPY[option].image}
            active={goal === option}
            onPress={() => onPick(option)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

export function CityStep({
  goal,
  city,
  onPick,
}: {
  goal: PlacesGoal;
  city: SampleCityId | null;
  onPick: (city: SampleCityId | null) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [query, setQuery] = useState("");
  const kind = GOAL_PLANS[goal]!;
  const needle = fold(query.trim());
  const cities = planCities(kind)
    .map((id) => ({ id, name: t(SAMPLE_CITIES[id].name) }))
    .filter(
      ({ id, name }) =>
        fold(name).includes(needle) || id.replace(/-/g, " ").includes(needle),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <View style={styles.cityStep}>
      <Head title={t(CITY_TITLES[goal])} body={t(CITY_HELP[goal])} />
      <View style={styles.search}>
        <AppSymbolIcon
          name="magnifyingglass"
          size={16}
          tintColor={theme.colors.muted}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t("goal.citySearch")}
          placeholderTextColor={theme.colors.faint}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView
        style={styles.cityList}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {cities.map(({ id, name }) => (
          <Option
            key={id}
            label={name}
            image={CITY_PICTURES[id].view}
            active={city === id}
            onPress={() => onPick(id)}
          />
        ))}
        <Option
          label={t(
            kind === "trip" ? "interests.cityNotSure" : "goal.citySomewhere",
          )}
          active={false}
          onPress={() => onPick(null)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.gap(3),
    paddingBottom: theme.gap(2),
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
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  list: {
    gap: theme.gap(1),
    paddingBottom: theme.gap(2),
  },
  cityStep: {
    flex: 1,
    gap: theme.gap(2),
  },
  cityList: {
    flex: 1,
  },
  search: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.gap(1),
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1),
    paddingRight: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  optionActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  optionText: {
    flex: 1,
    gap: 2,
    paddingLeft: theme.gap(0.5),
  },
  optionLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  optionBody: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
}));
