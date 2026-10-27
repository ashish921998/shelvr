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
  TRIP_PACES,
} from "@/lib/trip-planner";
import { TRIP_INTERESTS, type TripInterest } from "@convex/model/tripPlan";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function tick() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
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

export function CityPicker({
  cities,
  value,
  onChange,
}: {
  cities: CityChoice[];
  value: string;
  onChange: (city: string) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const fill = useAccentFill();
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
              onPress={() => onChange(choice.city)}
            />
          ))}
        </ScrollView>
      ) : null}
      <TextInput
        testID="new-trip-city"
        value={value}
        onChangeText={onChange}
        placeholder={t("tripPlanner.cityPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("tripPlanner.whereTo")}
        maxLength={MAX_CITY_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        style={styles.input}
      />
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
