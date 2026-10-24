import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { QuestionTitle, ScalePressable } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { SAMPLE_CITIES, type SampleCityId } from "@/lib/sample-cities";
import { planCities, type PlanKind } from "@/lib/sample-plans";
import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Above this many cities the grid gets a search field. */
const SEARCH_FROM = 6;

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function CityTile({
  id,
  name,
  selected,
  onPress,
}: {
  id: SampleCityId;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      onPress={onPress}
      style={[styles.tile, selected && styles.tileSelected]}
    >
      <Image
        source={CITY_PICTURES[id].view}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tileScrim} />
      <Text style={styles.tileName} numberOfLines={1}>
        {name}
      </Text>
    </ScalePressable>
  );
}

export function CityStep({
  kind,
  city,
  onPick,
}: {
  kind: PlanKind;
  city: SampleCityId | null;
  onPick: (city: SampleCityId | null) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  const all = planCities(kind)
    .map((id) => ({ id, name: t(SAMPLE_CITIES[id].name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cities = all.filter(
    ({ id, name }) =>
      fold(name).includes(needle) || id.replace(/-/g, " ").includes(needle),
  );
  return (
    <View style={styles.wrap}>
      <QuestionTitle
        title={t("onboardingQ.cityTitle")}
        body={t("onboardingQ.cityBody")}
      />
      {all.length > SEARCH_FROM ? (
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
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {cities.map(({ id, name }) => (
          <CityTile
            key={id}
            id={id}
            name={name}
            selected={city === id}
            onPress={() => onPick(id)}
          />
        ))}
        <ScalePressable
          accessibilityRole="button"
          onPress={() => onPick(null)}
          style={styles.elsewhere}
        >
          <Text style={styles.elsewhereText}>
            {t(
              kind === "trip" ? "interests.cityNotSure" : "goal.citySomewhere",
            )}
          </Text>
        </ScalePressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  scroll: {
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: theme.gap(1.5),
    paddingBottom: theme.gap(3),
  },
  tile: {
    width: "48.5%",
    aspectRatio: 1,
    justifyContent: "flex-end",
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: theme.colors.surfaceMuted,
  },
  tileSelected: {
    borderColor: theme.colors.primary,
  },
  tileScrim: {
    ...StyleSheet.absoluteFillObject,
    experimental_backgroundImage:
      "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.6) 100%)",
  },
  tileName: {
    ...theme.type.headline,
    color: "#FFFFFF",
  },
  elsewhere: {
    width: "100%",
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  elsewhereText: {
    ...theme.type.bodyLabel,
    color: theme.colors.foreground,
  },
  search: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 999,
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
}));
