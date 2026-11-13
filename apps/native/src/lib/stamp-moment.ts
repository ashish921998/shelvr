import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
    }
  | { kind: "bulk"; count: number; cover: string | null };

export type StampSurface = "city" | "already_been";

export type StampPlace = {
  city: string;
  cover: string | null;
  cityVisited: number;
};

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
  afterSheet: 400,
} as const;

const NO_CITY: StampPlace = { city: "", cover: null, cityVisited: 1 };

export function placeStampMoment(
  name: string,
  { city, cover, cityVisited }: StampPlace = NO_CITY,
): StampMoment {
  return { kind: "place", name, city, cover, firstInCity: cityVisited === 0 };
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
  return moment.firstInCity && moment.city
    ? t("passport.momentFirstInCity", { city: moment.city })
    : t("passport.momentStamped", { name: moment.name });
}

function stampInk(moment: StampMoment): string {
  return moment.kind === "place" && moment.city
    ? moment.city
    : t("passport.wentNoDate");
}

type Play = (
  moment: StampMoment,
  surface: StampSurface,
  afterMs?: number,
) => void;

const StampMomentContext = createContext<Play>(() => {});

export const StampMomentPlayContext = StampMomentContext.Provider;

export function useStampMoment(): Play {
  return useContext(StampMomentContext);
}

export function useStampMomentPlayer(reduced: boolean): {
  shown: ShownStamp | null;
  play: Play;
  dismiss: () => void;
} {
  const [shown, setShown] = useState<ShownStamp | null>(null);
  const nextId = useRef(0);
  const showing = useRef<ReturnType<typeof setTimeout>[]>([]);
  const landing = useRef(new Set<ReturnType<typeof setTimeout>>());

  const clearShowing = useCallback(() => {
    for (const timer of showing.current) clearTimeout(timer);
    showing.current = [];
  }, []);

  useEffect(() => {
    const landings = landing.current;
    return () => {
      clearShowing();
      for (const timer of landings) clearTimeout(timer);
    };
  }, [clearShowing]);

  const dismiss = useCallback(() => {
    clearShowing();
    setShown(null);
  }, [clearShowing]);

  const show = useCallback(
    (moment: StampMoment, surface: StampSurface) => {
      clearShowing();
      const line = stampLine(moment);
      nextId.current += 1;
      setShown({ id: nextId.current, moment, line, ink: stampInk(moment) });
      analytics.capture("passport_stamp_landed", {
        surface,
        first_in_city: moment.kind === "place" && moment.firstInCity,
        count: moment.kind === "bulk" ? moment.count : 1,
      });
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
      showing.current.push(setTimeout(dismiss, STAMP_TIMING.shown));
    },
    [clearShowing, dismiss, reduced],
  );

  const play = useCallback<Play>(
    (moment, surface, afterMs = 0) => {
      if (afterMs <= 0) {
        show(moment, surface);
        return;
      }
      clearShowing();
      showing.current.push(setTimeout(() => show(moment, surface), afterMs));
    },
    [clearShowing, show],
  );

  return { shown, play, dismiss };
}
