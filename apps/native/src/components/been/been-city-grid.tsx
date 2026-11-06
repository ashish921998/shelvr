import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { ScalePressable } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import {
  SAMPLE_CITIES,
  SAMPLE_CITY_IDS,
  cityMatches,
  type SampleCityId,
} from "@/lib/sample-cities";
import { Image } from "expo-image";
import { useState } from "react";
import { Keyboard, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const TILE_SCRIM = {
  experimental_backgroundImage:
    "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.6) 100%)",
};

function BeenTile({
  id,
  name,
  checked,
  onPress,
}: {
  id: SampleCityId;
  name: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <ScalePressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      testID={`been-city-${id}`}
      onPress={onPress}
      style={[styles.tile, checked && styles.tileChecked]}
    >
      <Image
        source={CITY_PICTURES[id].view}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.tileScrim, TILE_SCRIM]} />
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
      {checked ? (
        <View style={styles.badge}>
          <AppSymbolIcon
            name="checkmark"
            size={12}
            weight="bold"
            tintColor={theme.colors.onTint}
          />
        </View>
      ) : null}
    </ScalePressable>
  );
}

export function BeenCityGrid({
  picked,
  onToggle,
}: {
  picked: readonly SampleCityId[];
  onToggle: (city: SampleCityId) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [query, setQuery] = useState("");
  const cities = SAMPLE_CITY_IDS.map((id) => ({
    id,
    name: t(SAMPLE_CITIES[id].name),
  }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ id, name }) => cityMatches(id, name, query));
  return (
    <View style={styles.wrap}>
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
        style={styles.scroll}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {cities.map(({ id, name }) => (
          <BeenTile
            key={id}
            id={id}
            name={name}
            checked={picked.includes(id)}
            onPress={() => {
              Keyboard.dismiss();
              void haptics.selection();
              onToggle(id);
            }}
          />
        ))}
        {cities.length === 0 ? (
          <Text style={styles.noMatch}>{t("been.noMatch")}</Text>
        ) : null}
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
    justifyContent: "flex-start",
    columnGap: theme.gap(1),
    rowGap: theme.gap(1),
    paddingBottom: theme.gap(3),
  },
  tile: {
    width: "31.5%",
    aspectRatio: 1,
    justifyContent: "flex-end",
    padding: theme.gap(1),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: theme.colors.surfaceMuted,
  },
  tileChecked: {
    borderColor: theme.colors.primary,
  },
  tileScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  tileName: {
    ...theme.type.labelStrong,
    color: theme.colors.onOverlay,
  },
  badge: {
    position: "absolute",
    top: theme.gap(0.75),
    right: theme.gap(0.75),
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  noMatch: {
    ...theme.type.subhead,
    width: "100%",
    textAlign: "center",
    color: theme.colors.muted,
    paddingTop: theme.gap(2),
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
