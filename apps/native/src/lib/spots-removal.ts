import { analytics } from "@/lib/analytics";
import { keptPlaces, type RevealPin, samePin } from "@/lib/spots-reveal";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

const UNDO_MS = 6000;

type SpotsExit = "done" | "city" | "fix" | "back";

export type SpotsRemoval = ReturnType<typeof useSpotsRemoval>;

export function useSpotsRemoval(
  itemId: Id<"items">,
  found: RevealPin[],
  revealed: boolean,
) {
  const convex = useConvex();
  const listed = useQuery(
    api.placeCorrections.getPlaces,
    revealed ? { itemId } : "skip",
  );
  const savePlaces = useMutation(api.placeCorrections.savePlaces);
  const [staged, setStaged] = useState<RevealPin[]>([]);
  const [undo, setUndo] = useState<RevealPin | null>(null);
  const latest = useRef({ listed, staged, revealed, count: found.length });
  useEffect(() => {
    latest.current = { listed, staged, revealed, count: found.length };
  });
  const written = useRef(0);
  const exit = useRef<SpotsExit>("back");
  const left = useRef(false);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const write = async () => {
    const pending = latest.current.staged.slice(written.current);
    if (pending.length === 0) return;
    written.current = latest.current.staged.length;
    setUndo(null);
    let failure: unknown = null;
    for (const fresh of [false, true]) {
      const data = fresh
        ? await convex.query(api.placeCorrections.getPlaces, { itemId })
        : latest.current.listed;
      if (!data) continue;
      try {
        await savePlaces({
          itemId,
          version: data.version,
          places: keptPlaces(data.places, pending),
        });
        return;
      } catch (error) {
        failure = error;
      }
    }
    analytics.captureError("spots_removal_failed", failure);
  };

  const leave = (via: SpotsExit) => {
    if (left.current || !latest.current.revealed) return;
    left.current = true;
    analytics.capture("share_spots_left", {
      pin_count: latest.current.count,
      removed: latest.current.staged.length,
      via,
    });
    void write();
  };
  const onUnmount = useRef(leave);
  useEffect(() => {
    onUnmount.current = leave;
  });
  useEffect(() => () => onUnmount.current(exit.current), []);

  return {
    shown: found.filter((pin) => !staged.some((gone) => samePin(pin, gone))),
    undo,
    remove: (pin: RevealPin) => {
      analytics.capture("share_spots_place_removed", {
        pin_count: found.length,
      });
      setStaged((pins) => [...pins, pin]);
      setUndo(pin);
    },
    restore: () => {
      if (!undo) return;
      analytics.capture("share_spots_place_restored", {
        pin_count: found.length,
      });
      setStaged((pins) => pins.filter((pin) => pin !== undo));
      setUndo(null);
    },
    fix: async () => {
      analytics.capture("share_spots_fix_opened", {
        pin_count: found.length,
        staged_removals: staged.length - written.current,
      });
      exit.current = "fix";
      await write();
    },
    flush: write,
    leave,
  };
}
