import { t, useAppLocale } from "@/lib/i18n";
import { cityStampLabel, type CityStamp } from "@/lib/city-stamp-data";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const CITY_STAMP_SIZE = 112;
const TILTS = ["-6deg", "4deg", "-3deg", "7deg"];

export function CityStampArt({
  name,
  country,
  size = CITY_STAMP_SIZE,
  tilt = "-6deg",
}: {
  name: string;
  country: string | null;
  size?: number;
  tilt?: string;
}) {
  const small = size < 72;
  return (
    <View
      testID="city-stamp-art"
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ rotate: tilt }],
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          small && styles.innerSmall,
          { borderRadius: size / 2 },
        ]}
      >
        <Text
          style={[styles.name, small && styles.nameSmall]}
          numberOfLines={name.includes(" ") ? 2 : 1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1}
        >
          {name}
        </Text>
        {country && !small ? (
          <Text style={styles.country} maxFontSizeMultiplier={1}>
            {country}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function CityStampTile({
  stamp,
  index,
  onPress,
}: {
  stamp: CityStamp;
  index: number;
  onPress: () => void;
}) {
  useAppLocale();
  const name = cityStampLabel(stamp.city);
  return (
    <Pressable
      testID={`city-stamp-${stamp.city}`}
      accessibilityRole="button"
      accessibilityLabel={t("cityStamps.label", { city: name })}
      accessibilityHint={t("cityStamps.removeHint")}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <CityStampArt
        name={name}
        country={stamp.country}
        tilt={TILTS[index % TILTS.length]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  outer: {
    padding: 4,
    borderWidth: 2.5,
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.primarySoft,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.25),
    paddingHorizontal: theme.gap(1),
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.primaryText,
  },
  innerSmall: { paddingHorizontal: theme.gap(0.25) },
  name: {
    ...theme.type.labelStrong,
    color: theme.colors.primaryText,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nameSmall: { ...theme.type.badge, letterSpacing: 0.5 },
  country: {
    ...theme.type.caption,
    color: theme.colors.primaryText,
    letterSpacing: 2,
  },
  tile: { alignItems: "center", padding: theme.gap(0.5) },
  pressed: { opacity: theme.opacity.pressed },
}));
