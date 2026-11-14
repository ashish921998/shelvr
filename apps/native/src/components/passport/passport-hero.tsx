import { CityStampArt } from "@/components/passport/city-stamp";
import { StampArt } from "@/components/passport/stamp-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { badgeEmoji, badgeName, badgeProgress } from "@/lib/badge-copy";
import { type CityStamp, cityStampLabel } from "@/lib/city-stamp-data";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import { type Stamp, stampDate, stampId } from "@/lib/passport";
import { type BadgeTotals, nextBadge } from "@convex/model/badges";
import { passportCounts } from "@convex/model/passport";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const CITY_SIZE = 84;
const PLACE_SIZE = 64;
const PLACE_SPOTS = [
  { left: 70, top: 0, rotate: "6deg" },
  { left: 104, top: 30, rotate: "-4deg" },
];

function recentStamps(stamps: readonly Stamp[]): Stamp[] {
  return [...stamps]
    .sort((a, b) => (stampDate(b) ?? 0) - (stampDate(a) ?? 0))
    .slice(0, PLACE_SPOTS.length);
}

function StampPile({
  stamps,
  city,
}: {
  stamps: readonly Stamp[];
  city: CityStamp | undefined;
}) {
  const places = recentStamps(stamps);
  return (
    <View testID="passport-hero-pile" style={styles.pile} aria-hidden>
      {places.map((stamp, index) => {
        const at = stampDate(stamp);
        const spot = PLACE_SPOTS[index];
        return (
          <View
            key={stampId(stamp)}
            style={[
              styles.place,
              {
                left: spot.left,
                top: spot.top,
                transform: [{ rotate: spot.rotate }],
              },
            ]}
          >
            <StampArt
              cover={stamp.cover}
              ink={at === null ? (stamp.city ?? "") : formatRecentDate(at)}
              size={PLACE_SIZE}
            />
          </View>
        );
      })}
      <View style={styles.city}>
        {city ? (
          <CityStampArt
            name={cityStampLabel(city.city)}
            country={city.country}
            size={CITY_SIZE}
            tilt="-9deg"
          />
        ) : places.length === 0 ? (
          <View style={styles.blankStamp} />
        ) : null}
      </View>
    </View>
  );
}

function NextBadge({
  totals,
  locked,
  onUnlock,
}: {
  totals: BadgeTotals;
  locked: boolean;
  onUnlock: () => void;
}) {
  const { theme } = useUnistyles();
  const next = nextBadge(totals);
  if (next === null) return null;
  const name = badgeName(next.badge.id);
  const progress = badgeProgress(next);
  const title = t("passport.heroNext", { badge: name });
  const label = `${title}, ${progress}`;
  const content = (
    <>
      <View style={styles.nextLine}>
        <Text style={styles.nextEmoji}>{badgeEmoji(next.badge.id)}</Text>
        <Text style={styles.nextTitle} numberOfLines={1}>
          {title}
        </Text>
        {locked ? (
          <AppSymbolIcon name="lock" size={12} tintColor={theme.colors.muted} />
        ) : null}
        <Text style={styles.nextCount} numberOfLines={1}>
          {progress}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${(next.have / next.badge.goal) * 100}%` },
          ]}
        />
      </View>
    </>
  );
  if (!locked) {
    return (
      <View
        testID="passport-hero-next"
        accessible
        accessibilityLabel={label}
        style={styles.next}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID="passport-hero-next"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("badges.lockedHint")}
      onPress={onUnlock}
      style={({ pressed }) => [styles.next, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function PassportHero({
  stamps,
  cityStamps,
  totals,
  locked,
  onUnlock,
}: {
  stamps: readonly Stamp[];
  cityStamps: readonly CityStamp[];
  totals: BadgeTotals | undefined;
  locked: boolean;
  onUnlock: () => void;
}) {
  useAppLocale();
  const counts = passportCounts(stamps, cityStamps);
  const cities = t("passport.citiesCount", { count: counts.cities });
  const where =
    counts.countries === null
      ? cities
      : t("passport.heroWhere", {
          cities,
          countries: t("passport.countriesCount", { count: counts.countries }),
        });
  return (
    <View testID="passport-hero" style={styles.card}>
      <View style={styles.top}>
        <View
          style={styles.counts}
          accessible
          accessibilityLabel={`${t("passport.placesCount", { count: counts.places })}, ${where}`}
        >
          <Text style={styles.number}>{counts.places}</Text>
          <Text style={styles.label}>{t("passport.heroStamped")}</Text>
          <Text style={styles.where}>{where}</Text>
        </View>
        <StampPile stamps={stamps} city={cityStamps[0]} />
      </View>
      {totals ? (
        <NextBadge totals={totals} locked={locked} onUnlock={onUnlock} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.gap(2),
    padding: theme.gap(2),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  top: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  counts: { flex: 1, minWidth: 0, gap: theme.gap(0.25) },
  number: { ...theme.type.hero, color: theme.colors.foreground },
  label: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  where: { ...theme.type.caption, color: theme.colors.muted },
  pile: { width: 168, height: 112 },
  place: { position: "absolute" },
  city: { position: "absolute", left: 0, top: 18 },
  blankStamp: {
    width: CITY_SIZE,
    height: CITY_SIZE,
    borderRadius: CITY_SIZE / 2,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
  },
  next: {
    gap: theme.gap(1),
    paddingTop: theme.gap(1.75),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  nextLine: { flexDirection: "row", alignItems: "center", gap: theme.gap(1) },
  nextEmoji: { ...theme.type.subhead },
  nextTitle: {
    ...theme.type.subheadStrong,
    flex: 1,
    color: theme.colors.foreground,
  },
  nextCount: { ...theme.type.caption, color: theme.colors.muted },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
}));
