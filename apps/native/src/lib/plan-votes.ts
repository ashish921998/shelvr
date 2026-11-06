import { analytics } from "@/lib/analytics";
import { type CityPin, cityPinId } from "@/lib/city-pins";
import { t } from "@/lib/i18n";
import { webUrl } from "@/lib/web-url";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  MAX_PLAN_PLACES,
  PLAN_SHARE_TTL_MS,
  placeKey,
} from "@convex/model/plan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Share } from "react-native";

export type VoteLink = NonNullable<
  FunctionReturnType<typeof api.planShares.cityPlanVotes>
>;
export type LinkPlace = VoteLink["places"][number];
export type VotesRow = {
  kind: "ask" | "waiting" | "votes" | "closed";
  title: string;
  subtitle: string;
  label: string;
  token?: string;
};

type Latest = NonNullable<VoteLink["latest"]>;

const CLOCK_TICK_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function useVoteLink(city: string): VoteLink | null | undefined {
  return useQuery(convexQuery(api.planShares.cityPlanVotes, { city })).data;
}

export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
      return () => clearInterval(timer);
    }, []),
  );
  return now;
}

function daysLeft(expiresAt: number, now: number): number {
  return Math.max(
    1,
    Math.ceil(Math.min(expiresAt - now, PLAN_SHARE_TTL_MS) / DAY_MS),
  );
}

function latestLine({ name, place, choice }: Latest): string {
  if (name === undefined) {
    return choice === "pick"
      ? t("plan.someoneVotedPick", { place })
      : t("plan.someoneVotedPass", { place });
  }
  return choice === "pick"
    ? t("plan.votedPick", { name, place })
    : t("plan.votedPass", { name, place });
}

function latestLabel({ name, place, choice }: Latest): string {
  if (name === undefined) {
    return choice === "pick"
      ? t("plan.someoneWouldGo", { place })
      : t("plan.someoneWouldPass", { place });
  }
  return choice === "pick"
    ? t("plan.wouldGo", { name, place })
    : t("plan.wouldPass", { name, place });
}

function rowLabel(title: string, subtitle: string): string {
  return /[.!?。]$/.test(title)
    ? `${title} ${subtitle}`
    : `${title}, ${subtitle}`;
}

function askRow(): VotesRow {
  const title = t("plan.ask");
  const subtitle = t("plan.askHint");
  return { kind: "ask", title, subtitle, label: rowLabel(title, subtitle) };
}

export function votesRow(link: VoteLink | null, now: number): VotesRow {
  if (link === null) return askRow();
  const open = link.expiresAt > now;
  if (!open) {
    if (link.voters === 0) return askRow();
    const title = t("plan.votingClosed", { count: link.voters });
    const subtitle = t("plan.askHint");
    return {
      kind: "closed",
      title,
      subtitle,
      label: rowLabel(title, subtitle),
    };
  }
  const days = t("plan.daysLeft", { count: daysLeft(link.expiresAt, now) });
  if (link.voters === 0) {
    const title = t("plan.noVotesYet");
    return {
      kind: "waiting",
      title,
      subtitle: days,
      label: rowLabel(title, days),
      token: link.token,
    };
  }
  const voters = t("plan.voterCount", { count: link.voters });
  if (link.latest === undefined) {
    return {
      kind: "votes",
      title: voters,
      subtitle: days,
      label: rowLabel(voters, days),
      token: link.token,
    };
  }
  const subtitle = `${voters} ${days}`;
  return {
    kind: "votes",
    title: latestLine(link.latest),
    subtitle,
    label: rowLabel(latestLabel(link.latest), subtitle),
    token: link.token,
  };
}

export function linkPlaceFor(
  link: Pick<VoteLink, "places">,
  pin: CityPin,
  pins: readonly CityPin[],
): LinkPlace | undefined {
  const key = placeKey(pin.name);
  const sameSave = pins.filter(
    (other) => other.itemId === pin.itemId && placeKey(other.name) === key,
  );
  const exact =
    sameSave.length === 1
      ? link.places.find(
          (place) =>
            place.itemId === pin.itemId && placeKey(place.name) === key,
        )
      : undefined;
  if (exact !== undefined) return exact;
  const sameName = pins.filter((other) => placeKey(other.name) === key);
  if (sameName.length !== 1) return undefined;
  return link.places.find((place) => placeKey(place.name) === key);
}

export function tallyFor(
  link: VoteLink | null | undefined,
  pin: CityPin,
  pins: readonly CityPin[],
): { picks: number; passes: number } | undefined {
  if (link === null || link === undefined || link.voters === 0) {
    return undefined;
  }
  const place = linkPlaceFor(link, pin, pins);
  return place === undefined
    ? undefined
    : { picks: place.picks, passes: place.passes };
}

export function initialChoice(
  pins: readonly CityPin[],
  filtered: readonly CityPin[],
  openLink: VoteLink | null,
): string[] {
  const mapped =
    openLink === null
      ? []
      : pins.filter((pin) => linkPlaceFor(openLink, pin, pins) !== undefined);
  return (mapped.length > 0 ? mapped : filtered)
    .slice(0, MAX_PLAN_PLACES)
    .map(cityPinId);
}

export function sameShortlist(
  link: VoteLink,
  chosen: readonly CityPin[],
  pins: readonly CityPin[],
): boolean {
  const keys = chosen.map((pin) => linkPlaceFor(link, pin, pins)?.key);
  return (
    chosen.length === link.places.length &&
    keys.every((key) => key !== undefined) &&
    new Set(keys).size === keys.length
  );
}

export async function shareVoteLink(token: string): Promise<boolean> {
  const url = webUrl(`/p/${encodeURIComponent(token)}`);
  const result = await Share.share({ message: t("plan.askText", { url }) });
  return result.action === Share.sharedAction;
}

function uniqueChoices(chosen: readonly CityPin[]): CityPin[] {
  const seen = new Set<string>();
  return chosen.filter((pin) => {
    const id = `${pin.itemId}\n${placeKey(pin.name)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

type Pending = { token: string; reused: boolean; count: number };

export function useAskVotes(
  city: string,
  openLink: VoteLink | null,
  pins: readonly CityPin[],
) {
  const ensureCitySpace = useMutation(api.spaces.ensureCitySpace);
  const createPlanShare = useMutation(api.planShares.createPlanShare);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Pending | null>(null);

  const send = useCallback(
    async (chosen: CityPin[]): Promise<boolean> => {
      if (openLink !== null && sameShortlist(openLink, chosen, pins)) {
        pending.current = {
          token: openLink.token,
          reused: true,
          count: chosen.length,
        };
        return true;
      }
      setBusy(true);
      try {
        const places = uniqueChoices(chosen).map((pin) => ({
          name: pin.name,
          why: "",
          itemId: pin.itemId as Id<"items">,
        }));
        const spaceId = await ensureCitySpace({ city });
        const token = await createPlanShare({ spaceId, city, places });
        pending.current = { token, reused: false, count: places.length };
        return true;
      } catch (error) {
        analytics.capture("plan_ask_failed", { reason: "link" });
        analytics.captureError("plan_ask_failed", error);
        Alert.alert(t("plan.askFailedTitle"), t("errors.retrySoon"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [city, openLink, pins, ensureCitySpace, createPlanShare],
  );

  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (next === null) return;
    try {
      if (await shareVoteLink(next.token)) {
        analytics.capture("plan_asked", {
          place_count: next.count,
          reused: next.reused,
        });
      }
    } catch (error) {
      analytics.capture("plan_ask_failed", { reason: "share" });
      analytics.captureError("plan_ask_failed", error);
    }
  }, []);

  return { busy, send, flush };
}
