import { isDarkThemeName } from "@/lib/appearance";
import { appleZoom } from "@/lib/city-pins";
import { t, useAppLocale } from "@/lib/i18n";
import type { CardPlace, SavedOn } from "@/lib/passport";
import { fitCamera } from "@/lib/trip";
import { AppleMaps } from "expo-maps";
import type { ComponentRef, Ref } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BASE_WIDTH = 360;

const SAVED_ON = {
  instagram: "passport.cardSavedInstagram",
  tiktok: "passport.cardSavedTiktok",
  both: "passport.cardSavedBoth",
  elsewhere: "passport.cardSavedElsewhere",
} as const;

function CardMap({
  places,
  width,
  height,
  margin,
}: {
  places: CardPlace[];
  width: number;
  height: number;
  margin: number;
}) {
  const { theme, rt } = useUnistyles();
  const located = places.filter(
    (place): place is Required<CardPlace> =>
      place.lat !== undefined && place.lng !== undefined,
  );
  const fit = fitCamera(
    located.map((place) => ({ latitude: place.lat, longitude: place.lng })),
    {
      width,
      height,
      top: 28,
      bottom: 28,
      worldWidth: 256,
      centerY: height / 2,
    },
  );
  if (!fit || process.env.EXPO_OS !== "ios") return null;
  const camera = {
    ...fit,
    zoom: Math.min(
      appleZoom(fit.zoom, fit.coordinates.latitude, width, height),
      15,
    ),
  };
  return (
    <View
      style={[styles.map, { height, marginTop: margin }]}
      pointerEvents="none"
    >
      <AppleMaps.View
        style={StyleSheet.absoluteFill}
        cameraPosition={camera}
        colorScheme={
          isDarkThemeName(rt.themeName)
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false }}
        annotations={located.map((place) => ({
          id: String(place.number),
          coordinates: { latitude: place.lat, longitude: place.lng },
          text: String(place.number),
          backgroundColor: theme.colors.primaryText,
          textColor: theme.colors.surface,
        }))}
      />
    </View>
  );
}

export function ShareCard({
  ref,
  city,
  total,
  month,
  savedOn,
  places,
  width,
}: {
  ref?: Ref<ComponentRef<typeof View>>;
  city: string;
  total: number;
  month: string | null;
  savedOn: SavedOn;
  places: CardPlace[];
  width: number;
}) {
  useAppLocale();
  const s = width / BASE_WIDTH;
  const height = Math.round((width * 16) / 9);
  const more = total - places.length;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width, height, padding: 22 * s }]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.kicker, { fontSize: 11 * s }]}
      >
        {t("passport.cardKicker")}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          styles.title,
          { fontSize: 38 * s, lineHeight: 40 * s, marginTop: 6 * s },
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
      >
        {t("passport.cardTitle", { count: total })}
      </Text>
      <Text
        allowFontScaling={false}
        style={[styles.sub, { fontSize: 14 * s, marginTop: 8 * s }]}
      >
        {month ? t("passport.cardSub", { city, month }) : city}
      </Text>
      <CardMap
        places={places}
        width={width - 44 * s}
        height={(places.length > 3 ? 150 : 230) * s}
        margin={16 * s}
      />
      <View style={{ gap: 8 * s, marginTop: 16 * s }}>
        {places.map((place) => (
          <View key={place.number} style={[styles.row, { gap: 10 * s }]}>
            <View
              style={[
                styles.badge,
                { width: 22 * s, height: 22 * s, borderRadius: 11 * s },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.badgeText, { fontSize: 11 * s }]}
              >
                {place.number}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={[styles.place, { fontSize: 16 * s }]}
              numberOfLines={1}
            >
              {place.name}
            </Text>
          </View>
        ))}
        {more > 0 ? (
          <Text
            allowFontScaling={false}
            style={[styles.sub, { fontSize: 14 * s }]}
          >
            {t("passport.cardMore", { count: more })}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Text
          allowFontScaling={false}
          style={[styles.sub, { fontSize: 13 * s, lineHeight: 18 * s }]}
        >
          {t(SAVED_ON[savedOn])}
          {"\n"}
          {t("passport.cardWent")}
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.wordmark, { fontSize: 24 * s }]}
        >
          shelvr
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: { overflow: "hidden", backgroundColor: theme.colors.background },
  kicker: {
    ...theme.type.labelStrong,
    color: theme.colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
  sub: { ...theme.type.subhead, color: theme.colors.muted },
  map: {
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  row: { flexDirection: "row", alignItems: "center" },
  badge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryText,
  },
  badgeText: { ...theme.type.captionStrong, color: theme.colors.surface },
  place: {
    flexShrink: 1,
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  wordmark: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
}));
