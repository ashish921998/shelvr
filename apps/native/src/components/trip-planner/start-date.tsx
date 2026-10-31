import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { isDarkThemeName } from "@/lib/appearance";
import { formattingLocale, t } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import { formatTripDay } from "@/lib/trip";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/**
 * The trip's optional first day: "Add date" until one is picked, then the date with a clear
 * button. Android's picker is a dialog, so a date is only taken once the person confirms it.
 */
export function StartDate({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const { theme, rt } = useUnistyles();
  const [androidOpen, setAndroidOpen] = useState(false);
  const today = new Date();
  const androidPicker = androidOpen ? (
    <DateTimePicker
      value={value ?? today}
      mode="date"
      minimumDate={today}
      onChange={(event, date) => {
        setAndroidOpen(false);
        if (event.type === "set" && date) onChange(date);
      }}
    />
  ) : null;
  if (value === null) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (Platform.OS === "android") setAndroidOpen(true);
            else onChange(today);
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
        {androidPicker}
      </>
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
          {androidPicker}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
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
  pressed: {
    opacity: theme.opacity.pressed,
  },
}));
