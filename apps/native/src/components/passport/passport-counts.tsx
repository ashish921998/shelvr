import { t } from "@/lib/i18n";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

export function PassportCounts({
  places,
  cities,
  countries,
}: {
  places: number;
  cities: number;
  countries: number | null;
}) {
  return (
    <View style={styles.counts}>
      <Count value={places} label={t("passport.places")} />
      <View style={styles.divider} />
      <Count value={cities} label={t("passport.cities")} />
      {countries !== null ? (
        <>
          <View style={styles.divider} />
          <Count value={countries} label={t("passport.countries")} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  counts: {
    flexDirection: "row",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  count: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
  },
  countValue: { ...theme.type.displayTitle, color: theme.colors.foreground },
  countLabel: {
    ...theme.type.labelStrong,
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  divider: { width: 1, backgroundColor: theme.colors.border },
}));
