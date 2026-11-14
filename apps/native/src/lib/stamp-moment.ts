import { analytics } from "@/lib/analytics";
import { badgeName } from "@/lib/badge-copy";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { BADGES, type BadgeId } from "@convex/model/badges";
import { useFocusEffect, useNavigation } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo } from "react-native";

export type StampMoment =
  | {
      kind: "place";
      name: string;
      city: string;
      cover: string | null;
      firstInCity: boolean;
      completedTotal: number | null;
    }
  | { kind: "bulk"; count: number; cover: string | null }
  | { kind: "city"; city: string };

export type StampSurface =
  | "city"
  | "already_been"
  | "next_to_stamp"
  | "city_stamps";

export type StampPlace = {
  city: string;
  cover: string | null;
  cityVisited: number;
  cityTotal?: number;
};

type CityCount = { stamped: number; total: number };

export type ShownStamp = {
  id: number;
  moment: StampMoment;
  line: string;
  ink: string;
};

export const STAMP_TIMING = {
  drop: 240,
  squash: 80,
  settle: 130,
  ring: 320,
  shown: 1800,
  sheetSettle: 550,
  queueLimit: 4000,
} as const;

export const BADGE_TIMING = {
  flip: 420,
  shown: 5000,
  window: 6000,
  grace: 300,
} as const;

export type ShownBadge = { id: number; badge: BadgeId; more: number };

type Timer = ReturnType<typeof setTimeout>;

type WaitingBadges = { ids: BadgeId[]; at: number; matched: boolean };

const LANDS_AFTER_STAMP: ReadonlySet<BadgeId> = new Set(
  BADGES.filter((badge) => badge.measure === "countries").map(
    (badge) => badge.id,
  ),
);

function inTableOrder(ids: readonly BadgeId[]): BadgeId[] {
  return BADGES.map((badge) => badge.id).filter((id) => ids.includes(id));
}

function useTimers() {
  const timers = useRef(new Set<Timer>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);
  return useCallback((run: () => void, ms: number): Timer => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
    return timer;
  }, []);
}

function useBadgeQueue(reduced: boolean) {
  const [badge, setBadge] = useState<ShownBadge | null>(null);
  const nextId = useRef(0);
  const waiting = useRef<WaitingBadges | null>(null);
  const lastStampAt = useRef<number | null>(null);
  const stampBusy = useRef(false);
  const showing = useRef<Timer | null>(null);
  const later = useTimers();

  const dismissBadge = useCallback(() => {
    if (showing.current !== null) clearTimeout(showing.current);
    showing.current = null;
    setBadge(null);
  }, []);

  const show = useCallback(
    (ids: readonly BadgeId[]) => {
      const [first, ...rest] = ids;
      if (first === undefined) return;
      nextId.current += 1;
      setBadge({ id: nextId.current, badge: first, more: rest.length });
      for (const id of [first, ...rest]) {
        analytics.capture("passport_badge_unlocked", { badge: id });
      }
      AccessibilityInfo.announceForAccessibility(
        t("badges.unlocked", { badge: badgeName(first) }),
      );
      if (reduced) void haptics.success();
      else later(() => void haptics.success(), BADGE_TIMING.flip);
      if (showing.current !== null) clearTimeout(showing.current);
      showing.current = later(dismissBadge, BADGE_TIMING.shown);
    },
    [dismissBadge, later, reduced],
  );

  const flush = useCallback(() => {
    const next = waiting.current;
    if (next === null || !next.matched || stampBusy.current) return;
    waiting.current = null;
    show(next.ids);
  }, [show]);

  const unlock = useCallback(
    (ids: readonly BadgeId[]) => {
      const now = Date.now();
      const prior = waiting.current;
      const live = prior !== null && now - prior.at <= BADGE_TIMING.window;
      const stampAt = lastStampAt.current;
      waiting.current = {
        ids: inTableOrder([...(live ? prior.ids : []), ...ids]),
        at: now,
        matched:
          (live && prior.matched) ||
          ids.some((id) => LANDS_AFTER_STAMP.has(id)) ||
          (stampAt !== null && now - stampAt <= BADGE_TIMING.window),
      };
      later(flush, BADGE_TIMING.grace);
    },
    [flush, later],
  );

  const stampStarted = useCallback(() => {
    const now = Date.now();
    lastStampAt.current = now;
    stampBusy.current = true;
    dismissBadge();
    const next = waiting.current;
    if (next === null) return;
    if (now - next.at <= BADGE_TIMING.window) next.matched = true;
    else waiting.current = null;
  }, [dismissBadge]);

  const stampEnded = useCallback(() => {
    stampBusy.current = false;
    flush();
  }, [flush]);

  return { badge, unlock, dismissBadge, stampStarted, stampEnded };
}

const NO_CITY: StampPlace = { city: "", cover: null, cityVisited: 1 };

export function cityStampPlace(
  city: string,
  cover: string | null,
  count: CityCount | undefined,
): StampPlace {
  return count === undefined
    ? { city, cover, cityVisited: 1 }
    : { city, cover, cityVisited: count.stamped, cityTotal: count.total };
}

export function placeStampMoment(
  name: string,
  { city, cover, cityVisited, cityTotal }: StampPlace = NO_CITY,
): StampMoment {
  return {
    kind: "place",
    name,
    city,
    cover,
    firstInCity: cityVisited === 0,
    completedTotal: city && cityVisited + 1 === cityTotal ? cityTotal : null,
  };
}

export function bulkStampMoment(
  count: number,
  places: readonly { cover: string | null }[],
): StampMoment | null {
  if (count <= 0) return null;
  const cover = places.find((place) => place.cover)?.cover ?? null;
  return { kind: "bulk", count, cover };
}

export function cityStampMoment(city: string): StampMoment {
  return { kind: "city", city };
}

export function stampLine(moment: StampMoment): string {
  if (moment.kind === "city") {
    return t("passport.momentCityStamp", { city: moment.city });
  }
  if (moment.kind === "bulk") {
    return t("passport.momentBulk", { count: moment.count });
  }
  if (moment.completedTotal !== null) {
    return t("passport.momentCityComplete", { city: moment.city });
  }
  return moment.firstInCity && moment.city
    ? t("passport.momentFirstInCity", { city: moment.city })
    : t("passport.momentStamped", { name: moment.name });
}

function stampInk(moment: StampMoment): string {
  return moment.kind !== "bulk" && moment.city
    ? moment.city
    : t("passport.wentNoDate");
}

type Play = (moment: StampMoment, surface: StampSurface) => void;

export type StampMomentControls = {
  play: Play;
  queue: Play;
  release: () => void;
};

const StampMomentContext = createContext<StampMomentControls>({
  play: () => {},
  queue: () => {},
  release: () => {},
});

export const StampMomentPlayContext = StampMomentContext.Provider;

export function useStampMoment(): Pick<StampMomentControls, "play" | "queue"> {
  return useContext(StampMomentContext);
}

type TransitionListener = (
  type: "transitionEnd",
  callback: (event: { data?: { closing?: boolean } }) => void,
) => () => void;

export function useStampMomentLanding(): void {
  const { release } = useContext(StampMomentContext);
  const navigation = useNavigation() as unknown as {
    addListener: TransitionListener;
  };
  useFocusEffect(
    useCallback(() => {
      const settle = setTimeout(release, STAMP_TIMING.sheetSettle);
      const off = navigation.addListener("transitionEnd", (event) => {
        if (!event.data?.closing) release();
      });
      return () => {
        clearTimeout(settle);
        off();
      };
    }, [navigation, release]),
  );
}

export function useStampMomentPlayer(reduced: boolean): {
  shown: ShownStamp | null;
  controls: StampMomentControls;
  dismiss: () => void;
  badge: ShownBadge | null;
  dismissBadge: () => void;
  unlock: (ids: readonly BadgeId[]) => void;
} {
  const [shown, setShown] = useState<ShownStamp | null>(null);
  const { badge, unlock, dismissBadge, stampStarted, stampEnded } =
    useBadgeQueue(reduced);
  const nextId = useRef(0);
  const showing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landing = useRef(new Set<ReturnType<typeof setTimeout>>());
  const pending = useRef<{ moment: StampMoment; surface: StampSurface } | null>(
    null,
  );
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowing = useCallback(() => {
    if (showing.current !== null) clearTimeout(showing.current);
    showing.current = null;
  }, []);

  const clearPending = useCallback(() => {
    if (expiry.current !== null) clearTimeout(expiry.current);
    expiry.current = null;
    pending.current = null;
  }, []);

  useEffect(() => {
    const landings = landing.current;
    return () => {
      clearShowing();
      clearPending();
      for (const timer of landings) clearTimeout(timer);
    };
  }, [clearShowing, clearPending]);

  const dismiss = useCallback(() => {
    clearShowing();
    setShown(null);
    stampEnded();
  }, [clearShowing, stampEnded]);

  const play = useCallback<Play>(
    (moment, surface) => {
      clearShowing();
      stampStarted();
      const line = stampLine(moment);
      nextId.current += 1;
      setShown({ id: nextId.current, moment, line, ink: stampInk(moment) });
      analytics.capture("passport_stamp_landed", {
        surface,
        first_in_city: moment.kind === "place" && moment.firstInCity,
        count: moment.kind === "bulk" ? moment.count : 1,
      });
      if (moment.kind === "place" && moment.completedTotal !== null) {
        analytics.capture("passport_city_completed", {
          surface,
          total: moment.completedTotal,
        });
      }
      AccessibilityInfo.announceForAccessibility(line);
      if (reduced) {
        void haptics.impact("medium");
      } else {
        const timer = setTimeout(() => {
          landing.current.delete(timer);
          void haptics.impact("medium");
        }, STAMP_TIMING.drop);
        landing.current.add(timer);
      }
      showing.current = setTimeout(dismiss, STAMP_TIMING.shown);
    },
    [clearShowing, dismiss, reduced, stampStarted],
  );

  const queue = useCallback<Play>(
    (moment, surface) => {
      clearPending();
      pending.current = { moment, surface };
      expiry.current = setTimeout(clearPending, STAMP_TIMING.queueLimit);
    },
    [clearPending],
  );

  const release = useCallback(() => {
    const next = pending.current;
    if (next === null) return;
    clearPending();
    play(next.moment, next.surface);
  }, [clearPending, play]);

  const controls = useMemo(
    () => ({ play, queue, release }),
    [play, queue, release],
  );
  return { shown, controls, dismiss, badge, dismissBadge, unlock };
}
