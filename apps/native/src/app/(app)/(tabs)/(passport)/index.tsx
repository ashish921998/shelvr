import { EmptyState } from "@/components/empty-state";
import {
  PassportCityHead,
  useRingAccess,
} from "@/components/passport/passport-city-head";
import {
  MilestonesRow,
  useBadgeAccess,
} from "@/components/passport/milestones-row";
import { CityStampsSection } from "@/components/passport/city-stamps-section";
import { PassportHero } from "@/components/passport/passport-hero";
import { StampArt, StampSheet } from "@/components/passport/stamp-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { useBadgeTotals, useShareBadge } from "@/lib/badges";
import { useCityStamps } from "@/lib/city-stamp-data";
import { useRemoveCityStamp } from "@/lib/city-stamps";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type Stamp,
  openStampOf,
  type PassportSection,
  passportSections,
  stampId,
  shareCardHref,
  stampDate,
  type OpenStamp,
  useCityCompletion,
  usePassport,
} from "@/lib/passport";
import { useSharePassport } from "@/lib/passport-share";
import { ringComplete } from "@/components/passport/city-ring";
import { useStampMomentLanding } from "@/lib/stamp-moment";
import { usePlaceVisit } from "@/lib/use-place-visit";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const STAMP_SIZE = 92;
const TILTS = ["-4deg", "3deg", "-2deg", "4deg"];

function StampTile({
  stamp,
  index,
  solid,
  onPress,
}: {
  stamp: Stamp;
  index: number;
  solid: boolean;
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
          solid={solid}
        />
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {stamp.name}
      </Text>
    </Pressable>
  );
}

function ShareButton({
  visible,
  busy,
  onPress,
}: {
  visible: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  if (Platform.OS === "android") {
    return (
      <Stack.Screen
        options={{
          headerRight: visible
            ? () => (
                <HeaderIconButton
                  icon="square.and.arrow.up"
                  label={t("passportShare.share")}
                  disabled={busy}
                  onPress={onPress}
                />
              )
            : undefined,
        }}
      />
    );
  }
  if (!visible) return null;
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        icon="square.and.arrow.up"
        tintColor={theme.colors.foreground}
        disabled={busy}
        onPress={onPress}
      >
        {t("passportShare.share")}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

export default function PassportScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { stamps, failed, error } = usePassport();
  const visit = usePlaceVisit("passport");
  useStampMomentLanding();
  const sharing = useSharePassport(stamps?.length ?? 0);
  const completion = useCityCompletion();
  const cityStamps = useCityStamps();
  const removeCityStamp = useRemoveCityStamp();
  const ring = useRingAccess();
  const badges = useBadgeTotals();
  const badgeAccess = useBadgeAccess();
  const shareBadge = useShareBadge("milestones");
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
  useEffect(() => {
    if (completion.error) {
      analytics.captureError("passport_rings_load_failed", completion.error);
    }
  }, [completion.error]);
  useEffect(() => {
    if (cityStamps.error) {
      analytics.captureError(
        "passport_city_stamps_load_failed",
        cityStamps.error,
      );
    }
  }, [cityStamps.error]);
  useEffect(() => {
    if (badges.error) {
      analytics.captureError("passport_badges_load_failed", badges.error);
    }
  }, [badges.error]);

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
  const stampedCities = cityStamps.stamps ?? [];
  const sections = passportSections(
    stamps,
    completion.rows ?? [],
    stampedCities,
  );
  const head = (section: PassportSection) => (
    <PassportCityHead
      section={section}
      locked={ring.locked}
      onOpen={(city) =>
        router.push({ pathname: "/next-to-stamp", params: { city } })
      }
      onUnlock={ring.unlock}
      onShare={(city) => router.push(shareCardHref(city, "passport"))}
      onCityStamp={(city) => removeCityStamp(city, stampedCities.length - 1)}
    />
  );

  return (
    <>
      <ShareButton
        visible={stamps.length > 0}
        busy={sharing.busy}
        onPress={() => void sharing.share()}
      />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <PassportHero
          stamps={stamps}
          cityStamps={stampedCities}
          totals={badges.totals}
          locked={badgeAccess.locked}
          onUnlock={badgeAccess.unlock}
        />
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
        <CityStampsSection
          cities={sections.cities}
          total={stampedCities.length}
        />
        {badges.totals ? (
          <MilestonesRow
            totals={badges.totals}
            locked={badgeAccess.locked}
            onUnlock={badgeAccess.unlock}
            onShare={(badge) => void shareBadge(badge)}
          />
        ) : null}
        {sections.stamped.map((section) => (
          <View key={section.key} style={styles.city}>
            {head(section)}
            {section.stamps.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stamps}
              >
                {section.stamps.map((stamp, index) => (
                  <StampTile
                    key={stampId(stamp)}
                    stamp={stamp}
                    index={index}
                    solid={
                      section.completion !== null &&
                      ringComplete(section.completion)
                    }
                    onPress={() =>
                      setOpen(openStampOf(stamp, section.city ?? ""))
                    }
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        ))}
        {sections.waiting.length > 0 ? (
          <View style={styles.city}>
            <Text style={styles.waitingTitle}>
              {t("passport.notStampedYet")}
            </Text>
            {sections.waiting.map((section) => (
              <View key={section.key}>{head(section)}</View>
            ))}
          </View>
        ) : null}
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
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(4),
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
  waitingTitle: { ...theme.type.headline, color: theme.colors.muted },
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
