import { AppSymbolIcon } from "@/components/symbol";
import { useCityStamps } from "@/lib/city-stamp-data";
import { t, useAppLocale } from "@/lib/i18n";
import { stampId, usePassport } from "@/lib/passport";
import { passportCounts } from "@convex/model/passport";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const TILTS = ["-8deg", "3deg", "10deg"];

export function PassportRow({ hideEmpty = false }: { hideEmpty?: boolean }) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { stamps } = usePassport();
  const cities = useCityStamps().stamps ?? [];
  if (stamps === undefined) return null;
  const empty = stamps.length === 0 && cities.length === 0;
  if (empty && hideEmpty) return null;
  const counts = passportCounts(stamps, cities);
  const title = empty ? t("passport.beenTitle") : t("passport.yourPassport");
  const subtitle = empty
    ? t("passport.beenBody")
    : counts.places === 0
      ? t("passport.citiesCount", { count: counts.cities })
      : counts.cities > 1
        ? t("passport.rowCities", {
            places: t("passport.placesCount", { count: counts.places }),
            cities: t("passport.citiesCount", { count: counts.cities }),
          })
        : t("passport.placesCount", { count: counts.places });
  return (
    <Pressable
      testID="home-passport"
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={() => router.push(empty ? "/already-been" : "/passport")}
      style={({ pressed }) => [
        styles.row,
        empty && styles.rowEmpty,
        pressed && styles.pressed,
      ]}
    >
      {stamps.length === 0 ? (
        <View style={styles.icon}>
          <AppSymbolIcon
            name="checkmark"
            size={18}
            tintColor={theme.colors.primaryText}
          />
        </View>
      ) : (
        <View style={styles.stack}>
          {stamps.slice(0, 3).map((stamp, index) => (
            <View
              key={stampId(stamp)}
              style={[
                styles.mini,
                { left: index * 12, transform: [{ rotate: TILTS[index] }] },
              ]}
            >
              {stamp.cover ? (
                <Image
                  source={{ uri: stamp.cover }}
                  style={styles.miniCover}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.miniCover, styles.blank]} />
              )}
            </View>
          ))}
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  rowEmpty: { borderStyle: "dashed" },
  pressed: { opacity: theme.opacity.pressed },
  icon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
  },
  stack: { width: 56, height: 42 },
  mini: {
    position: "absolute",
    top: 2,
    width: 30,
    height: 38,
    padding: theme.gap(0.25),
    borderRadius: 5,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.surface,
  },
  miniCover: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: theme.colors.surfaceMuted,
  },
  blank: { backgroundColor: theme.colors.primarySoft },
  text: { flex: 1 },
  title: { ...theme.type.subheadLabel, color: theme.colors.foreground },
  subtitle: { ...theme.type.caption, color: theme.colors.muted },
}));
