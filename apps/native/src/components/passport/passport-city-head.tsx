import { CityRing, cityRingLabel } from "@/components/passport/city-ring";
import { CityStampArt } from "@/components/passport/city-stamp";
import { cityStampLabel } from "@/lib/city-stamp-data";
import { AppSymbolIcon } from "@/components/symbol";
import { analytics } from "@/lib/analytics";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import type { PassportSection } from "@/lib/passport";
import type { CityCompletion } from "@convex/model/cityCompletion";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const RING_SIZE = 40;
const HEAD_STAMP_SIZE = 64;

export function useRingAccess(): { locked: boolean; unlock: () => void } {
  const { entitled, loading } = useEntitlement();
  const { guard } = usePaywallGuard("passport");
  const unlock = useCallback(() => {
    analytics.capture("passport_paywall_opened", { surface: "ring" });
    void guard();
  }, [guard]);
  return { locked: !loading && !entitled, unlock };
}

function RingButton({
  completion,
  locked,
  onOpen,
  onUnlock,
}: {
  completion: CityCompletion;
  locked: boolean;
  onOpen: (city: string) => void;
  onUnlock: () => void;
}) {
  const { city, stamped, total } = completion;
  return (
    <Pressable
      testID="passport-city-ring"
      accessibilityRole="button"
      accessibilityLabel={cityRingLabel(completion, city, locked)}
      accessibilityHint={
        locked ? t("passport.ringLockedHint") : t("passport.ringHint")
      }
      hitSlop={8}
      onPress={locked ? onUnlock : () => onOpen(city)}
      style={({ pressed }) => [styles.ringButton, pressed && styles.pressed]}
    >
      <CityRing
        stamped={stamped}
        total={total}
        city={city}
        size={RING_SIZE}
        locked={locked}
      />
      <View style={styles.names}>
        <Text style={styles.cityName} numberOfLines={1}>
          {city}
        </Text>
        <Text style={styles.cityCount} numberOfLines={1}>
          {locked
            ? t("passport.ringLocked", { count: total, city })
            : t("passport.ringCount", {
                visited: Math.min(stamped, total),
                total,
              })}
        </Text>
      </View>
    </Pressable>
  );
}

export function PassportCityHead({
  section,
  locked,
  onOpen,
  onUnlock,
  onShare,
  onCityStamp,
}: {
  section: PassportSection;
  locked: boolean;
  onOpen: (city: string) => void;
  onUnlock: () => void;
  onShare: (city: string) => void;
  onCityStamp?: (city: string) => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { city, completion, stamps, cityStamp } = section;
  return (
    <View style={styles.cityHead}>
      {cityStamp ? (
        <Pressable
          testID="passport-city-head-stamp"
          accessibilityRole="button"
          accessibilityLabel={t("cityStamps.label", {
            city: cityStampLabel(cityStamp.city),
          })}
          accessibilityHint={t("cityStamps.removeHint")}
          disabled={onCityStamp === undefined}
          onPress={() => onCityStamp?.(cityStamp.city)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <CityStampArt
            name={cityStampLabel(cityStamp.city)}
            country={cityStamp.country}
            size={HEAD_STAMP_SIZE}
          />
        </Pressable>
      ) : null}
      {completion ? (
        <RingButton
          completion={completion}
          locked={locked}
          onOpen={onOpen}
          onUnlock={onUnlock}
        />
      ) : (
        <View style={styles.names}>
          <Text style={styles.cityName} numberOfLines={1}>
            {city ?? t("passport.elsewhere")}
          </Text>
          <Text style={styles.cityCount}>
            {t("passport.placesCount", { count: stamps.length })}
          </Text>
        </View>
      )}
      {city && stamps.length > 0 ? (
        <Pressable
          testID="passport-city-share"
          accessibilityRole="button"
          accessibilityLabel={t("passport.shareCity", { city })}
          hitSlop={12}
          onPress={() => onShare(city)}
          style={({ pressed }) => [styles.cityShare, pressed && styles.pressed]}
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
  );
}

const styles = StyleSheet.create((theme) => ({
  cityHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  ringButton: {
    flexShrink: 1,
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  names: { flexShrink: 1, gap: theme.gap(0.25) },
  cityName: { ...theme.type.title, color: theme.colors.foreground },
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
  pressed: { opacity: theme.opacity.pressed },
}));
