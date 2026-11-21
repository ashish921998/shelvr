import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { countryFlag } from "@/lib/trip-planner";
import {
  countryName,
  MAX_TRIP_COUNTRIES,
  TRIP_COUNTRY_CODES,
} from "@convex/model/tripCountries";
import { useLocales } from "expo-localization";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const POPULAR_COUNTRIES = [
  "US",
  "JP",
  "GB",
  "FR",
  "IT",
  "MX",
  "ES",
  "CA",
  "TH",
];
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  AE: ["UAE", "Emirates"],
  CZ: ["Czech Republic"],
  DE: ["Deutschland"],
  GB: ["UK", "Great Britain", "Britain"],
  JP: ["日本", "Nihon", "Nippon"],
  NL: ["Holland", "Nederland"],
  KR: ["Korea", "대한민국"],
  US: ["USA", "America", "United States of America"],
};

type CountryOption = { code: string; name: string; searchKeys: string[] };

function searchKey(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function countryOptions(locale: string): CountryOption[] {
  const display =
    typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames([locale], { type: "region" })
      : null;
  return TRIP_COUNTRY_CODES.map((code) => {
    const english = countryName(code) ?? code;
    const name = display?.of(code) ?? english;
    return {
      code,
      name,
      searchKeys: [name, english, code, ...(COUNTRY_ALIASES[code] ?? [])].map(
        searchKey,
      ),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));
}

function matchRank(country: CountryOption, needle: string) {
  if (country.searchKeys.includes(needle)) return 0;
  if (country.searchKeys.some((key) => key.startsWith(needle))) return 1;
  if (country.searchKeys.some((key) => key.includes(needle))) return 2;
  return 3;
}

function CountryRow({
  country,
  checked,
  disabled,
  onPress,
}: {
  country: CountryOption;
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={country.name}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <ThemedText variant="body" style={styles.name}>
        {countryFlag(country.code)} {country.name}
      </ThemedText>
      {checked ? (
        <AppSymbolIcon
          name="checkmark"
          size={17}
          tintColor={theme.colors.primaryText}
        />
      ) : null}
    </Pressable>
  );
}

function SelectedCountries({
  countries,
  onRemove,
}: {
  countries: CountryOption[];
  onRemove: (code: string) => void;
}) {
  const { theme } = useUnistyles();
  if (countries.length === 0) return null;
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chips}
    >
      {countries.map(({ code, name }) => (
        <Pressable
          key={code}
          accessibilityRole="button"
          accessibilityLabel={t("tripSetup.removeCountry", { name })}
          onPress={() => onRemove(code)}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <ThemedText variant="label">
            {countryFlag(code)} {name}
          </ThemedText>
          <AppSymbolIcon
            name="xmark"
            size={12}
            tintColor={theme.colors.primaryText}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function TripCountryPicker({
  countries,
  onChange,
}: {
  countries: string[];
  onChange: (countries: string[]) => void;
}) {
  const locale = useAppLocale();
  const [{ regionCode }] = useLocales();
  const { theme } = useUnistyles();
  const [query, setQuery] = useState("");
  const options = useMemo(() => countryOptions(locale), [locale]);
  const byCode = useMemo(
    () => new Map(options.map((country) => [country.code, country])),
    [options],
  );
  const suggested = regionCode ? byCode.get(regionCode) : undefined;
  const popular = POPULAR_COUNTRIES.filter(
    (code) => code !== suggested?.code,
  ).flatMap((code) => byCode.get(code) ?? []);
  const selected = countries.flatMap((code) => byCode.get(code) ?? []);
  const needle = searchKey(query.trim());
  const matches = needle
    ? options
        .map((country) => ({ country, rank: matchRank(country, needle) }))
        .filter(({ rank }) => rank < 3)
        .sort((a, b) => a.rank - b.rank)
        .map(({ country }) => country)
    : [];
  const sections = needle
    ? matches.length > 0
      ? [{ key: "search", title: "", data: matches }]
      : []
    : [
        ...(suggested
          ? [
              {
                key: "suggested",
                title: t("tripSetup.suggestedCountry"),
                data: [suggested],
              },
            ]
          : []),
        {
          key: "popular",
          title: t("tripSetup.popularCountries"),
          data: popular,
        },
        { key: "all", title: t("tripSetup.allCountries"), data: options },
      ];
  const remove = (code: string) =>
    onChange(countries.filter((country) => country !== code));

  return (
    <View style={styles.content}>
      <TextInput
        testID="trip-country-search"
        accessibilityLabel={t("tripSetup.searchCountries")}
        placeholder={t("tripSetup.searchCountries")}
        placeholderTextColor={theme.colors.muted}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={styles.input}
      />
      <SelectedCountries countries={selected} onRemove={remove} />
      <SectionList
        key={needle ? "search" : "browse"}
        sections={sections}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        keyExtractor={({ code }) => code}
        ListEmptyComponent={
          <ThemedText style={styles.muted}>
            {t("tripSetup.noCountries")}
          </ThemedText>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <ThemedText
              variant="bodyLabel"
              accessibilityRole="header"
              style={styles.heading}
            >
              {section.title}
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => {
          const checked = countries.includes(item.code);
          return (
            <CountryRow
              country={item}
              checked={checked}
              disabled={!checked && countries.length >= MAX_TRIP_COUNTRIES}
              onPress={() =>
                checked
                  ? remove(item.code)
                  : onChange([...countries, item.code])
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flex: 1,
    gap: theme.gap(1.5),
    padding: theme.gap(2.5),
    paddingBottom: theme.gap(4),
  },
  input: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.gap(1.5),
  },
  heading: {
    color: theme.colors.muted,
    paddingTop: theme.gap(1.5),
    paddingBottom: theme.gap(0.25),
  },
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  name: { flex: 1 },
  chipScroll: { flexGrow: 0 },
  chips: { gap: theme.gap(1) },
  chip: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.gap(1.5),
  },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
