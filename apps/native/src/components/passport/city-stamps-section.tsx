import { CityStampTile } from "@/components/passport/city-stamp";
import { AppSymbolIcon } from "@/components/symbol";
import type { CityStamp } from "@/lib/city-stamp-data";
import { useCityStampAccess, useRemoveCityStamp } from "@/lib/city-stamps";
import { t, useAppLocale } from "@/lib/i18n";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function CityStampsSection({
  cities,
  total,
}: {
  cities: readonly CityStamp[];
  total: number;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const access = useCityStampAccess(total);
  const remove = useRemoveCityStamp();
  return (
    <View style={styles.section}>
      <Pressable
        testID="passport-city-stamps"
        accessibilityRole="button"
        accessibilityHint={
          access.locked ? t("cityStamps.lockedHint") : undefined
        }
        onPress={access.open}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name={access.locked ? "lock" : "airplane"}
          size={14}
          tintColor={theme.colors.primaryText}
        />
        <Text style={styles.addText}>{t("cityStamps.add")}</Text>
      </Pressable>
      {cities.length > 0 ? (
        <View style={styles.grid}>
          {cities.map((stamp, index) => (
            <CityStampTile
              key={stamp.city}
              stamp={stamp}
              index={index}
              onPress={() => remove(stamp.city, total - 1)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.gap(1.5) },
  add: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  addText: {
    ...theme.type.subheadStrong,
    color: theme.colors.primaryText,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  pressed: { opacity: theme.opacity.pressed },
}));
