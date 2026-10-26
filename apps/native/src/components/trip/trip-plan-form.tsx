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
  daysSavesFill,
  formatTripDay,
  toDateKey,
  tripDayDate,
  tripPlaceEstimate,
  type TripPace,
  type TripRequest,
} from "@/lib/trip";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { Host, Picker, Text } from "@expo/ui/swift-ui";
import {
  environment,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PACES: TripPace[] = ["easy", "balanced", "packed"];
const DAY_CHOICES = Array.from(
  { length: MAX_TRIP_DAYS - MIN_TRIP_DAYS + 1 },
  (_, index) => MIN_TRIP_DAYS + index,
);

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
  /** The city page this trip was opened from: the trip is for it, so no city is asked. */
  fixedCity?: string;
  /** Distinct mapped places the city page shows for `fixedCity`. */
  placeCount?: number;
  initial?: Partial<TripRequest>;
  onBuild: (request: TripRequest) => void;
  onCancel?: () => void;
};

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

function Segmented({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { theme, rt } = useUnistyles();
  return (
    <View style={styles.block}>
      <ThemedText variant="bodyLabel">{label}</ThemedText>
      <SegmentedControl
        values={values}
        selectedIndex={selected}
        onChange={(event) => onSelect(event.nativeEvent.selectedSegmentIndex)}
        appearance={isDarkThemeName(rt.themeName) ? "dark" : "light"}
        tintColor={theme.colors.primarySoft}
      />
    </View>
  );
}

function Days({
  days,
  onChange,
  fill,
}: {
  days: number;
  onChange: (days: number) => void;
  fill: number;
}) {
  const { theme, rt } = useUnistyles();
  const hint =
    days > fill ? (
      <ThemedText variant="caption" style={styles.muted}>
        {t("trip.daysFill", { count: fill })}
      </ThemedText>
    ) : null;
  if (process.env.EXPO_OS !== "ios") {
    return (
      <View style={styles.block}>
        <ThemedText variant="bodyLabel">{t("trip.howManyDays")}</ThemedText>
        <View style={styles.dayPills}>
          <TripSegments
            scroll
            labels={DAY_CHOICES.map(String)}
            selected={DAY_CHOICES.indexOf(days)}
            onSelect={(index) => onChange(DAY_CHOICES[index])}
            tinted
            accessibilityLabel={t("trip.howManyDays")}
          />
        </View>
        {hint}
      </View>
    );
  }
  return (
    <View style={styles.block}>
      <Row label={t("trip.howManyDays")}>
        <Host matchContents ignoreSafeArea="all">
          <Picker
            selection={DAY_CHOICES.indexOf(days)}
            onSelectionChange={(index) => onChange(DAY_CHOICES[index])}
            modifiers={[
              pickerStyle("menu"),
              tint(theme.colors.primaryText),
              environment(
                "colorScheme",
                isDarkThemeName(rt.themeName) ? "dark" : "light",
              ),
            ]}
            label={t("trip.howManyDays")}
          >
            {DAY_CHOICES.map((count, index) => (
              <Text key={count} modifiers={[tag(index)]}>
                {t("trip.dayCount", { count })}
              </Text>
            ))}
          </Picker>
        </Host>
      </Row>
      {hint}
    </View>
  );
}

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

export function TripPlanForm({
  saveCount,
  cities,
  fixedCity,
  placeCount,
  initial,
  onBuild,
  onCancel,
}: Props) {
  useAppLocale();
  const [days, setDays] = useState(initial?.days ?? 3);
  const [pace, setPace] = useState<TripPace>(initial?.pace ?? "balanced");
  const [start, setStart] = useState<Date | null>(() => {
    const date = tripDayDate(initial?.startDate, 0);
    return date && date.getTime() >= new Date().setHours(0, 0, 0, 0)
      ? date
      : null;
  });
  const [picked, setPicked] = useState(initial?.city);
  const cityIndex = Math.max(
    0,
    cities.findIndex((c) => c.city.toLowerCase() === picked?.toLowerCase()),
  );
  const askCity = fixedCity === undefined && cities.length >= 2;
  const city = fixedCity ?? cities[cityIndex]?.city;
  const sendCity = fixedCity !== undefined || askCity;
  const fillCount = tripPlaceEstimate(
    saveCount,
    cities,
    sendCity ? city : undefined,
    placeCount,
  );

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
          <ThemedText variant="bodyLabel" style={styles.cityLabel}>
            {t("trip.whichCity")}
          </ThemedText>
          <TripSegments
            scroll
            labels={cities.map((c) => c.city)}
            selected={cityIndex}
            onSelect={(index) => setPicked(cities[index]?.city)}
            tinted
            accessibilityLabel={t("trip.whichCity")}
          />
        </View>
      ) : null}

      <View style={styles.rows}>
        <Days
          days={days}
          onChange={setDays}
          fill={daysSavesFill(fillCount, pace)}
        />
        <Segmented
          label={t("trip.pace")}
          values={PACES.map(paceLabel)}
          selected={PACES.indexOf(pace)}
          onSelect={(index) => setPace(PACES[index])}
        />
        <View style={styles.divider} />
        <Row label={t("trip.starting")}>
          <StartDate value={start} onChange={setStart} />
        </Row>
      </View>

      <Button
        title={t("trip.build")}
        onPress={() =>
          onBuild({
            days,
            pace,
            ...(start ? { startDate: toDateKey(start) } : {}),
            ...(sendCity && city ? { city } : {}),
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
  // The block bleeds to the sheet edge so the pills can scroll; the label keeps the sheet's inset.
  cityLabel: {
    paddingHorizontal: theme.gap(2),
  },
  rows: {
    gap: theme.gap(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.control.minHeight,
    gap: theme.gap(2),
  },
  block: {
    gap: theme.gap(1),
  },
  dayPills: {
    marginHorizontal: -theme.gap(2),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
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
  // The compact date picker is laid out narrower than its text and clips the year without a floor.
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
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
