import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Chip, type ChipFill } from "@/components/trip-planner/chip";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { MAX_TRIP_DAYS, MIN_TRIP_DAYS, type TripPace } from "@/lib/trip";
import {
  type CityChoice,
  interestLabel,
  MAX_CITY_LENGTH,
  MAX_STAY_LENGTH,
  paceLabel,
  sameCity,
  toggleInterest,
  tripCitySuggestions,
  type TripCityCompletion,
  TRIP_PACES,
} from "@/lib/trip-planner";
import { TRIP_INTERESTS, type TripInterest } from "@convex/model/tripPlan";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function tick() {
  void haptics.selection();
}

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <ThemedText variant="bodyLabel" accessibilityRole="header">
          {title}
        </ThemedText>
        {hint ? (
          <ThemedText variant="caption" style={styles.muted}>
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Form chips fill amber once picked, with the dark text the amber needs. */
function useAccentFill(): ChipFill {
  const { theme } = useUnistyles();
  return { background: theme.colors.primary, foreground: theme.colors.onTint };
}

function useCitySuggestions(query: string, locale: string) {
  const search = useAction(api.tripPlanner.searchTripCities);
  const [answer, setAnswer] = useState<{
    query: string;
    locale: string;
    cities: TripCityCompletion[];
  } | null>(null);
  useEffect(() => {
    if (query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const cities = await search({ query, locale });
        if (!cancelled) setAnswer({ query, locale, cities });
      } catch (error) {
        if (cancelled) return;
        analytics.captureError("trip_city_search_failed", error);
        setAnswer({ query, locale, cities: [] });
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, locale, search]);
  return query.length >= 2 &&
    answer?.query === query &&
    answer.locale === locale
    ? answer.cities
    : null;
}

export function CityPicker({
  cities,
  value,
  onChange,
}: {
  cities: CityChoice[];
  value: string;
  onChange: (city: string) => void;
}) {
  const locale = useAppLocale();
  const { theme } = useUnistyles();
  const fill = useAccentFill();
  const [focused, setFocused] = useState(false);
  const query = focused ? value.trim() : "";
  const remoteCities = useCitySuggestions(query, locale);
  const pins = useQuery(
    convexQuery(
      api.mapPlaces.listMapPlaces,
      focused && cities.length > 0 ? {} : "skip",
    ),
  );
  const suggestions = tripCitySuggestions(
    cities,
    remoteCities ?? [],
    pins.data ?? [],
    query,
  );
  const searching = query.length >= 2 && remoteCities === null;
  const select = (city: string) => {
    tick();
    onChange(city);
    setFocused(false);
    Keyboard.dismiss();
  };
  return (
    <View style={styles.cityPicker}>
      {cities.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.bleed}
          contentContainerStyle={styles.cityChips}
        >
          {cities.map((choice) => (
            <Chip
              key={choice.city}
              label={choice.city}
              detail={t("trip.revealSaves", { count: choice.count })}
              selected={sameCity(choice.city, value)}
              pick="radio"
              fill={fill}
              onPress={() => {
                onChange(choice.city);
                Keyboard.dismiss();
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      <TextInput
        testID="new-trip-city"
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t("tripPlanner.cityPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("tripPlanner.whereTo")}
        maxLength={MAX_CITY_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        style={styles.input}
      />
      {suggestions.length > 0 || searching ? (
        <View style={styles.citySuggestions}>
          {suggestions.map(({ city, label, count }) => (
            <Pressable
              key={city}
              accessibilityRole="button"
              onPress={() => select(city)}
              style={({ pressed }) => [
                styles.citySuggestion,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText variant="bodyLabel">{label}</ThemedText>
              {count !== undefined ? (
                <ThemedText variant="caption" style={styles.muted}>
                  {t("trip.revealSaves", { count })}
                </ThemedText>
              ) : null}
            </Pressable>
          ))}
          {searching && suggestions.length === 0 ? (
            <ThemedText
              variant="body"
              accessibilityLiveRegion="polite"
              style={[styles.citySuggestion, styles.muted]}
            >
              {t("tripPlanner.searching")}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: AppSymbolName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stepButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <AppSymbolIcon
        name={icon}
        size={16}
        weight="semibold"
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

export function DaysStepper({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  useAppLocale();
  const label = t("trip.dayCount", { count: days });
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("trip.howManyDays")}
      accessibilityValue={{ text: label }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment" && days < MAX_TRIP_DAYS)
          onChange(days + 1);
        if (nativeEvent.actionName === "decrement" && days > MIN_TRIP_DAYS)
          onChange(days - 1);
      }}
    >
      <StepButton
        icon="minus"
        label={t("tripPlanner.fewerDays")}
        disabled={days <= MIN_TRIP_DAYS}
        onPress={() => onChange(days - 1)}
      />
      <ThemedText variant="headline" style={styles.stepperValue}>
        {label}
      </ThemedText>
      <StepButton
        icon="plus"
        label={t("tripPlanner.moreDays")}
        disabled={days >= MAX_TRIP_DAYS}
        onPress={() => onChange(days + 1)}
      />
    </View>
  );
}

export function InterestChips({
  selected,
  onChange,
}: {
  selected: TripInterest[];
  onChange: (interests: TripInterest[]) => void;
}) {
  useAppLocale();
  const fill = useAccentFill();
  return (
    <View style={styles.wrapChips}>
      {TRIP_INTERESTS.map((interest) => (
        <Chip
          key={interest}
          label={interestLabel(interest)}
          selected={selected.includes(interest)}
          pick="checkbox"
          fill={fill}
          onPress={() => onChange(toggleInterest(selected, interest))}
        />
      ))}
    </View>
  );
}

/** Easy, balanced or packed, as radio chips so the picked pace is announced on both platforms. */
export function PaceChips({
  selected,
  onChange,
}: {
  selected: TripPace;
  onChange: (pace: TripPace) => void;
}) {
  useAppLocale();
  const fill = useAccentFill();
  return (
    <View
      style={styles.wrapChips}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("trip.pace")}
    >
      {TRIP_PACES.map((pace) => (
        <Chip
          key={pace}
          label={paceLabel(pace)}
          selected={pace === selected}
          pick="radio"
          fill={fill}
          onPress={() => onChange(pace)}
        />
      ))}
    </View>
  );
}

export function StayField({
  value,
  onChange,
}: {
  value: string;
  onChange: (stay: string) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <TextInput
      testID="new-trip-stay"
      value={value}
      onChangeText={onChange}
      placeholder={t("tripPlanner.stayPlaceholder")}
      placeholderTextColor={theme.colors.muted}
      accessibilityLabel={t("tripPlanner.stay")}
      maxLength={MAX_STAY_LENGTH}
      autoCorrect={false}
      returnKeyType="done"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.gap(1.25) },
  sectionHeading: { gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
  cityPicker: { gap: theme.gap(1.25) },
  citySuggestions: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
  },
  citySuggestion: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(0.75),
  },
  // The chip row bleeds to the screen edge so it can scroll; its content keeps the inset.
  bleed: { marginHorizontal: -theme.gap(2.5) },
  cityChips: {
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
  },
  wrapChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  input: {
    ...theme.type.body,
    color: theme.colors.foreground,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  stepperValue: { textAlign: "center", flex: 1 },
}));
