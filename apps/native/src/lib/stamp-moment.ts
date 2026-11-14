import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
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
  | { kind: "bulk"; count: number; cover: string | null };

export type StampSurface = "city" | "already_been" | "next_to_stamp";

export type StampPlace = {
  city: string;
  cover: string | null;
  cityVisited: number;
  cityTotal?: number;
  cityStamps?: number;
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
  { city, cover, cityVisited, cityTotal, cityStamps = 0 }: StampPlace = NO_CITY,
): StampMoment {
  return {
    kind: "place",
    name,
    city,
    cover,
    firstInCity: cityVisited === 0 && cityStamps === 0,
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

export function stampLine(moment: StampMoment): string {
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
  return moment.kind === "place" && moment.city
    ? moment.city
    : t("passport.wentNoDate");
}

type Play = (moment: StampMoment, surface: StampSurface) => void;

export type StampMomentControls = {
  play: Play;
  queue: Play;
  release: () => void;
  cancel: () => void;
};

const StampMomentContext = createContext<StampMomentControls>({
  play: () => {},
  queue: () => {},
  release: () => {},
  cancel: () => {},
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
  const { release, cancel } = useContext(StampMomentContext);
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
        cancel();
      };
    }, [navigation, release, cancel]),
  );
}

export function useStampMomentPlayer(reduced: boolean): {
  shown: ShownStamp | null;
  controls: StampMomentControls;
  dismiss: () => void;
} {
  const [shown, setShown] = useState<ShownStamp | null>(null);
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
  }, [clearShowing]);

  const play = useCallback<Play>(
    (moment, surface) => {
      clearShowing();
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
    [clearShowing, dismiss, reduced],
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
    () => ({ play, queue, release, cancel: clearPending }),
    [play, queue, release, clearPending],
  );
  return { shown, controls, dismiss };
}
