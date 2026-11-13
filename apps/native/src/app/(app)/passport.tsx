import { EmptyState } from "@/components/empty-state";
import { PassportCounts } from "@/components/passport/passport-counts";
import { StampArt, StampSheet } from "@/components/passport/stamp-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type Stamp,
  openStampOf,
  stampId,
  shareCardHref,
  stampDate,
  type OpenStamp,
  usePassport,
} from "@/lib/passport";
import { useSharePassport } from "@/lib/passport-share";
import { groupByCity, passportCounts } from "@convex/model/passport";
import { usePlaceVisit } from "@/lib/use-place-visit";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const STAMP_SIZE = 92;
const TILTS = ["-4deg", "3deg", "-2deg", "4deg"];

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
          ink={
            at === null
              ? (stamp.city ?? t("passport.wentNoDate"))
              : formatRecentDate(at)
          }
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
  const { stamps, failed, error } = usePassport();
  const visit = usePlaceVisit("passport");
  const sharing = useSharePassport(stamps?.length ?? 0);
  const [open, setOpen] = useState<OpenStamp | null>(null);
  const remove = async () => {
    if (open === null) return;
    const { itemId, name, spot } = open;
    if (await visit.toggle(itemId, { name, ...spot }, false)) {
      setOpen((current) => (current === open ? null : current));
    }
  };

  useEffect(() => {
    if (error) analytics.captureError("passport_load_failed", error);
  }, [error]);

  const opened = useRef(false);
  useEffect(() => {
    if (stamps === undefined || opened.current) return;
    opened.current = true;
    analytics.capture("passport_opened", { places: stamps.length });
  }, [stamps]);

  if (failed) {
    return (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  if (stamps === undefined) return <ScreenLoader />;

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t("passport.title")}</Text>
      <PassportCounts {...passportCounts(stamps)} />
      {stamps.length > 0 ? (
        <Pressable
          testID="passport-share"
          accessibilityRole="button"
          disabled={sharing.busy}
          onPress={() => void sharing.share()}
          style={({ pressed }) => [
            styles.sharePassport,
            (pressed || sharing.busy) && styles.pressed,
          ]}
        >
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={15}
            tintColor={theme.colors.surface}
          />
          <Text style={styles.sharePassportText}>
            {t("passportShare.share")}
          </Text>
        </Pressable>
      ) : null}
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
      {groupByCity(stamps).map((group) => (
        <View key={group.city ?? ""} style={styles.city}>
          <View style={styles.cityHead}>
            <Text style={styles.cityName} numberOfLines={1}>
              {group.city ?? t("passport.elsewhere")}
            </Text>
            <Text style={styles.cityCount}>
              {t("passport.placesCount", { count: group.items.length })}
            </Text>
            {group.city ? (
              <Pressable
                testID="passport-city-share"
                accessibilityRole="button"
                accessibilityLabel={t("passport.shareCity", {
                  city: group.city,
                })}
                hitSlop={12}
                onPress={() =>
                  router.push(shareCardHref(group.city ?? "", "passport"))
                }
                style={({ pressed }) => [
                  styles.cityShare,
                  pressed && styles.pressed,
                ]}
              >
                <AppSymbolIcon
                  name="square.and.arrow.up"
                  size={14}
                  tintColor={theme.colors.primaryText}
                />
                <Text style={styles.cityShareText}>{t("common.share")}</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stamps}
          >
            {group.items.map((stamp, index) => (
              <StampTile
                key={stampId(stamp)}
                stamp={stamp}
                index={index}
                onPress={() => setOpen(openStampOf(stamp, group.city ?? ""))}
              />
            ))}
          </ScrollView>
        </View>
      ))}
      {stamps.some((stamp) => stamp.cover) ? (
        <Text style={styles.credit}>{t("passport.coversCredit")}</Text>
      ) : null}
      <StampSheet
        stamp={open}
        count={stamps.length}
        busy={visit.busy}
        onClose={() => setOpen(null)}
        onRemove={() => void remove()}
        onShare={(city) => {
          router.push(shareCardHref(city, "stamp"));
        }}
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
  sharePassport: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(0.75),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  sharePassportText: {
    ...theme.type.subheadStrong,
    color: theme.colors.surface,
  },
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
  cityShare: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  cityShareText: {
    ...theme.type.subheadStrong,
    color: theme.colors.primaryText,
  },
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
