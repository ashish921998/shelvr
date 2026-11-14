import { analytics } from "@/lib/analytics";
import { badgeName } from "@/lib/badge-copy";
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
import { useConvex, useConvexAuth } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Alert, Platform, Share } from "react-native";

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
  const totals = useMemo(
    () =>
      stamps.data === undefined || completion.rows === undefined
        ? undefined
        : badgeTotals(stamps.data, completion.rows),
    [stamps.data, completion.rows],
  );
  return { totals, error: stamps.error ?? completion.error };
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
  const convex = useConvex();
  return useCallback(
    async (badge: BadgeId) => {
      const message = t("badges.shareMessage", { badge: badgeName(badge) });
      try {
        const link =
          token ??
          (await convex
            .query(api.passportShares.myPassportShare, {})
            .catch(() => null));
        const result = await Share.share(
          shareContent(message, link === null ? null : passportUrl(link)),
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
    [convex, surface, token],
  );
}
