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
import {
  HEADLINE_MAX_SCALE,
  LARGE_TEXT_SCALE,
  useLargeText,
} from "@/lib/use-large-text";
import { Image } from "expo-image";
import { type ReactNode, useState } from "react";
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
  wide,
  onPress,
}: {
  id: SampleCityId;
  name: string;
  checked: boolean;
  wide: boolean;
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
      style={[
        styles.tile,
        wide && styles.tileWide,
        checked && styles.tileChecked,
      ]}
    >
      <Image
        source={CITY_PICTURES[id].view}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.tileScrim, TILE_SCRIM]} />
      <Text
        style={styles.tileName}
        numberOfLines={2}
        maxFontSizeMultiplier={LARGE_TEXT_SCALE}
      >
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
  header,
  picked,
  onToggle,
}: {
  header: ReactNode;
  picked: readonly SampleCityId[];
  onToggle: (city: SampleCityId) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const largeText = useLargeText();
  const [query, setQuery] = useState("");
  const cities = SAMPLE_CITY_IDS.map((id) => ({
    id,
    name: t(SAMPLE_CITIES[id].name),
  }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ id, name }) => cityMatches(id, name, query));
  const top = (
    <View style={styles.top}>
      {header}
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
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        />
      </View>
    </View>
  );
  return (
    <View style={styles.wrap}>
      {largeText ? null : top}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {largeText ? top : null}
        <View style={styles.grid}>
          {cities.map(({ id, name }) => (
            <BeenTile
              key={id}
              id={id}
              name={name}
              checked={picked.includes(id)}
              wide={largeText}
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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  top: {
    gap: theme.gap(2),
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.gap(2),
    paddingBottom: theme.gap(3),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    columnGap: theme.gap(1),
    rowGap: theme.gap(1),
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
  tileWide: {
    width: "48.5%",
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
