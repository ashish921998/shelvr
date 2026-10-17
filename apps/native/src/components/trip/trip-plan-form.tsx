import { AppSymbolIcon } from "@/components/symbol";
import { TripSegments } from "@/components/trip/trip-segments";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { isDarkThemeName } from "@/lib/appearance";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { fadeIn, motion } from "@/lib/motion";
import {
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  formatTripDay,
  toDateKey,
  tripDayDate,
  type TripPace,
  type TripRequest,
} from "@/lib/trip";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PACES: TripPace[] = ["easy", "balanced", "packed"];

// The day count rolls the way the tap went: a small state change, so it
// is short and eases out.
const ROLL = {
  up: {
    in: FadeInUp.duration(motion.duration.state).easing(motion.easing.out),
    out: FadeOutUp.duration(motion.duration.feedback).easing(motion.easing.out),
  },
  down: {
    in: FadeInDown.duration(motion.duration.state).easing(motion.easing.out),
    out: FadeOutDown.duration(motion.duration.feedback).easing(
      motion.easing.out,
    ),
  },
};
const RESIZE = LinearTransition.duration(motion.duration.enter).easing(
  motion.easing.inOut,
);

function paceLabel(pace: TripPace): string {
  switch (pace) {
    case "easy":
      return t("trip.paceEasy");
    case "balanced":
      return t("trip.paceBalanced");
    case "packed":
      return t("trip.pacePacked");
  }
}

type Props = {
  saveCount: number;
  cities: { city: string; count: number }[];
  initial?: Partial<TripRequest>;
  onBuild: (request: TripRequest) => void;
  onCancel?: () => void;
};

/** One row of the form: a label on the left, its control on the right. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <ThemedText variant="bodyLabel">{label}</ThemedText>
      {children}
    </View>
  );
}

/** Days as a stepper whose number rolls up or down with each tap. */
function DayStepper({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  const { theme } = useUnistyles();
  const [direction, setDirection] = useState<1 | -1>(1);
  const step = (by: 1 | -1) => {
    const next = days + by;
    if (next < MIN_TRIP_DAYS || next > MAX_TRIP_DAYS) return;
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    setDirection(by);
    onChange(next);
  };
  const stepButton = (by: 1 | -1) => {
    const disabled = by === 1 ? days >= MAX_TRIP_DAYS : days <= MIN_TRIP_DAYS;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={by === 1 ? t("trip.moreDays") : t("trip.fewerDays")}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => step(by)}
        hitSlop={6}
        style={({ pressed }) => [
          styles.stepButton,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <AppSymbolIcon
          name={by === 1 ? "plus" : "minus"}
          size={14}
          tintColor={theme.colors.foreground}
        />
      </Pressable>
    );
  };
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={t("trip.dayCount", { count: days })}
    >
      {stepButton(-1)}
      <View style={styles.stepValue}>
        <Animated.View
          key={days}
          entering={(direction === 1 ? ROLL.up : ROLL.down).in}
          exiting={(direction === 1 ? ROLL.up : ROLL.down).out}
          style={styles.stepNumber}
        >
          <ThemedText variant="header">{days}</ThemedText>
        </Animated.View>
      </View>
      {stepButton(1)}
    </View>
  );
}

/** The start date: "Add a date" until one is picked, then the native
 * compact picker (iOS) or the date with a tap to change it (Android). */
function StartDate({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const { theme, rt } = useUnistyles();
  const [androidOpen, setAndroidOpen] = useState(false);
  const today = new Date();
  if (value === null) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onChange(today);
          if (Platform.OS === "android") setAndroidOpen(true);
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.dateLink, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="calendar"
          size={14}
          tintColor={theme.colors.primaryText}
        />
        <ThemedText variant="secondaryLabel" style={styles.link}>
          {t("trip.addDate")}
        </ThemedText>
      </Pressable>
    );
  }
  return (
    <Animated.View entering={fadeIn} style={styles.dateRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("trip.clearDate")}
        onPress={() => onChange(null)}
        hitSlop={8}
        style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
      >
        <AppSymbolIcon name="xmark" size={12} tintColor={theme.colors.muted} />
      </Pressable>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          minimumDate={today}
          accentColor={theme.colors.primary}
          themeVariant={isDarkThemeName(rt.themeName) ? "dark" : "light"}
          locale={formattingLocale()}
          style={styles.compactPicker}
          onValueChange={(_, date) => onChange(date)}
        />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAndroidOpen(true)}
            hitSlop={8}
          >
            <ThemedText variant="secondaryLabel">
              {formatTripDay(value)}
            </ThemedText>
          </Pressable>
          {androidOpen ? (
            <DateTimePicker
              value={value}
              mode="date"
              minimumDate={today}
              onChange={(event, date) => {
                setAndroidOpen(false);
                if (event.type === "set" && date) onChange(date);
              }}
            />
          ) : null}
        </>
      )}
    </Animated.View>
  );
}

/**
 * "Plan my trip": how many days, when, how full, and (for a space whose
 * saves span cities) which city. The form never names a place itself.
 */
export function TripPlanForm({
  saveCount,
  cities,
  initial,
  onBuild,
  onCancel,
}: Props) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [days, setDays] = useState(initial?.days ?? 3);
  const [pace, setPace] = useState<TripPace>(initial?.pace ?? "balanced");
  const [start, setStart] = useState<Date | null>(() => {
    const date = tripDayDate(initial?.startDate, 0);
    return date && date.getTime() >= new Date().setHours(0, 0, 0, 0)
      ? date
      : null;
  });
  // Every city the saves name, most saves first; the row scrolls sideways.
  const offered = cities;
  const initialCity = Math.max(
    0,
    offered.findIndex(
      (c) => c.city.toLowerCase() === initial?.city?.toLowerCase(),
    ),
  );
  const [cityIndex, setCityIndex] = useState(initialCity);
  const city = offered[cityIndex]?.city;
  const askCity = cities.length >= 2;

  return (
    <Animated.View layout={RESIZE} style={styles.form}>
      <View style={styles.heading}>
        <ThemedText variant="sheetTitle">
          {city ? t("trip.planTitle", { city }) : t("trip.planTitleNoCity")}
        </ThemedText>
        <ThemedText variant="subhead" style={styles.muted}>
          {t("trip.planBody", { count: saveCount })}
        </ThemedText>
      </View>

      {askCity ? (
        <View style={styles.cityBlock}>
          <ThemedText variant="bodyLabel">{t("trip.whichCity")}</ThemedText>
          <TripSegments
            scroll
            labels={offered.map((c) => c.city)}
            selected={cityIndex}
            onSelect={setCityIndex}
            tintFor={() => theme.colors.primary}
            accessibilityLabel={t("trip.whichCity")}
          />
        </View>
      ) : null}

      <View style={styles.rows}>
        <Row label={t("trip.howManyDays")}>
          <DayStepper days={days} onChange={setDays} />
        </Row>
        <View style={styles.divider} />
        <Row label={t("trip.starting")}>
          <StartDate value={start} onChange={setStart} />
        </Row>
        <View style={styles.divider} />
        <View style={styles.paceRow}>
          <ThemedText variant="bodyLabel">{t("trip.pace")}</ThemedText>
          <View style={styles.paceControl}>
            <TripSegments
              labels={PACES.map(paceLabel)}
              selected={PACES.indexOf(pace)}
              onSelect={(index) => setPace(PACES[index])}
              accessibilityLabel={t("trip.pace")}
            />
          </View>
        </View>
      </View>

      <Button
        title={t("trip.build")}
        onPress={() =>
          onBuild({
            days,
            pace,
            ...(start ? { startDate: toDateKey(start) } : {}),
            ...(askCity && city ? { city } : {}),
          })
        }
      />
      {onCancel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          hitSlop={8}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        >
          <ThemedText variant="secondaryLabel" style={styles.muted}>
            {t("common.cancel")}
          </ThemedText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.gap(2.5),
  },
  heading: {
    gap: theme.gap(0.75),
  },
  muted: {
    color: theme.colors.muted,
  },
  cityBlock: {
    gap: theme.gap(1),
    marginHorizontal: -theme.gap(2),
  },
  rows: {
    gap: theme.gap(1.5),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.control.minHeight,
    gap: theme.gap(2),
  },
  paceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(2),
  },
  paceControl: {
    flexShrink: 1,
    flexGrow: 1,
    maxWidth: theme.gap(34),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  stepValue: {
    width: theme.gap(4),
    height: 32,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    position: "absolute",
  },
  dateLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  link: {
    color: theme.colors.primaryText,
  },
  dateRow: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.gap(1),
  },
  // The compact picker sizes to its date; without a floor it is laid out
  // narrower than the text and clips the year.
  compactPicker: {
    minWidth: 132,
  },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  cancel: {
    alignSelf: "center",
    paddingVertical: theme.gap(0.5),
  },
  disabled: {
    opacity: theme.opacity.disabled,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
