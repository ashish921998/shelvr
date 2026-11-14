import { analytics } from "@/lib/analytics";
import { badgeName } from "@/lib/badge-copy";
import { type CityStamp, useCityStamps } from "@/lib/city-stamp-data";
import { useEntitlement } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { useCityCompletion } from "@/lib/passport";
import { passportUrl, usePassportShare } from "@/lib/passport-share";
import { api } from "@convex/_generated/api";
import {
  type BadgeId,
  type BadgeTotals,
  badgeTotals,
  earnedBadges,
  newlyEarned,
} from "@convex/model/badges";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Alert, Platform, Share } from "react-native";

const NO_CITY_STAMPS: CityStamp[] = [];

export function useBadgeTotals(enabled = true): {
  totals: BadgeTotals | undefined;
  error: Error | null;
} {
  const { isAuthenticated } = useConvexAuth();
  const stamps = useQuery(
    convexQuery(
      api.placeVisits.listBadgeStamps,
      isAuthenticated && enabled ? {} : "skip",
    ),
  );
  const completion = useCityCompletion(enabled);
  const cities = useCityStamps(enabled);
  const cityRows = cities.error ? NO_CITY_STAMPS : cities.stamps;
  const totals = useMemo(
    () =>
      stamps.data === undefined ||
      completion.rows === undefined ||
      cityRows === undefined
        ? undefined
        : badgeTotals(stamps.data, completion.rows, cityRows),
    [stamps.data, completion.rows, cityRows],
  );
  return {
    totals,
    error: stamps.error ?? completion.error ?? cities.error,
  };
}

export function useBadgeUnlocks(unlock: (ids: BadgeId[]) => void): void {
  const { entitled } = useEntitlement();
  const { totals } = useBadgeTotals(entitled);
  const known = useRef<BadgeId[] | null>(null);
  useEffect(() => {
    if (totals === undefined) return;
    const earned = earnedBadges(totals);
    const before = known.current;
    known.current = earned;
    if (before === null) return;
    const fresh = newlyEarned(before, earned);
    if (fresh.length > 0) unlock(fresh);
  }, [totals, unlock]);
}

type ShareSurface = "moment" | "milestones";

function shareContent(message: string, link: string | null) {
  if (link === null) return { message };
  return Platform.OS === "ios"
    ? { message, url: link }
    : { message: `${message}\n${link}` };
}

export function useShareBadge(surface: ShareSurface) {
  const token = usePassportShare();
  return useCallback(
    async (badge: BadgeId) => {
      const message = t("badges.shareMessage", { badge: badgeName(badge) });
      try {
        const result = await Share.share(
          shareContent(message, token === null ? null : passportUrl(token)),
        );
        analytics.capture("passport_badge_shared", {
          badge,
          surface,
          shared: result.action === Share.sharedAction,
        });
      } catch (error) {
        analytics.captureError("passport_badge_share_failed", error);
        Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
      }
    },
    [surface, token],
  );
}
