import { StampArt, StampSheet } from "@/components/passport/stamp-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type Stamp,
  openStampOf,
  passportCities,
  passportCounts,
  stampDate,
  usePassport,
  useStamping,
} from "@/lib/passport";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const STAMP_SIZE = 92;
const TILTS = ["-4deg", "3deg", "-2deg", "4deg"];

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function StampTile({
  stamp,
  index,
  onPress,
}: {
  stamp: Stamp;
  index: number;
  onPress: () => void;
}) {
  const at = stampDate(stamp);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={stamp.name}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <View style={{ transform: [{ rotate: TILTS[index % TILTS.length] }] }}>
        <StampArt
          cover={stamp.cover}
          ink={at === null ? (stamp.city ?? "") : formatRecentDate(at)}
          size={STAMP_SIZE}
        />
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {stamp.name}
      </Text>
    </Pressable>
  );
}

export default function PassportScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { stamps } = usePassport();
  const stamping = useStamping("passport");

  const opened = useRef(false);
  useEffect(() => {
    if (stamps === undefined || opened.current) return;
    opened.current = true;
    analytics.capture("passport_opened", { places: stamps.length });
  }, [stamps]);

  if (stamps === undefined) return <ScreenLoader />;
  const counts = passportCounts(stamps);

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t("passport.title")}</Text>
      <View style={styles.counts}>
        <Count value={counts.places} label={t("passport.places")} />
        <View style={styles.divider} />
        <Count value={counts.cities} label={t("passport.cities")} />
        {counts.countries !== null ? (
          <>
            <View style={styles.divider} />
            <Count value={counts.countries} label={t("passport.countries")} />
          </>
        ) : null}
      </View>
      <Pressable
        testID="passport-backfill"
        accessibilityRole="button"
        onPress={() => router.push("/already-been")}
        style={({ pressed }) => [styles.backfill, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="plus"
          size={14}
          tintColor={theme.colors.primaryText}
        />
        <Text style={styles.backfillText}>{t("passport.beenSomewhere")}</Text>
      </Pressable>
      {stamps.length === 0 ? (
        <Text style={styles.muted}>{t("passport.beenBody")}</Text>
      ) : null}
      {passportCities(stamps).map((group) => (
        <View key={group.city ?? ""} style={styles.city}>
          <View style={styles.cityHead}>
            <Text style={styles.cityName} numberOfLines={1}>
              {group.city ?? t("passport.elsewhere")}
            </Text>
            <Text style={styles.cityCount}>
              {t("passport.placesCount", { count: group.stamps.length })}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stamps}
          >
            {group.stamps.map((stamp, index) => (
              <StampTile
                key={stamp.key}
                stamp={stamp}
                index={index}
                onPress={() =>
                  stamping.show(openStampOf(stamp, group.city ?? ""))
                }
              />
            ))}
          </ScrollView>
        </View>
      ))}
      {stamps.some((stamp) => stamp.cover) ? (
        <Text style={styles.credit}>{t("passport.coversCredit")}</Text>
      ) : null}
      <StampSheet
        stamp={stamping.open}
        count={stamps.length}
        busy={stamping.busy}
        onClose={stamping.close}
        onRemove={() => void stamping.remove()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
  title: { ...theme.type.displayTitle, color: theme.colors.foreground },
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
  backfill: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  backfillText: {
    ...theme.type.subheadStrong,
    color: theme.colors.primaryText,
  },
  muted: { ...theme.type.subhead, color: theme.colors.muted },
  city: { gap: theme.gap(1) },
  cityHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.gap(1),
  },
  cityName: {
    flexShrink: 1,
    ...theme.type.title,
    color: theme.colors.foreground,
  },
  cityCount: { ...theme.type.footnote, color: theme.colors.muted },
  stamps: { gap: theme.gap(2), paddingVertical: theme.gap(1) },
  tile: { width: STAMP_SIZE + 8, alignItems: "center", gap: theme.gap(1) },
  tileName: {
    ...theme.type.caption,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  credit: { ...theme.type.finePrint, color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
