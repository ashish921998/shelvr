import { analytics } from "@/lib/analytics";
import { keptPlaces, type RevealPin, samePin } from "@/lib/spots-reveal";
import { api } from "@convex/_generated/api";
import { uniquePlacePins } from "@convex/model/trip";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

const UNDO_MS = 6000;

type SpotsExit = "done" | "city" | "fix" | "back";

export type SpotsRemoval = ReturnType<typeof useSpotsRemoval>;

type Row = RevealPin & { members: RevealPin[] };

const rowOf = (pin: RevealPin, pins: RevealPin[]) =>
  uniquePlacePins<Row>(
    pins.map((member) => ({ ...member, members: [member] })),
    (kept, repeat) => ({
      ...kept,
      members: [...kept.members, ...repeat.members],
    }),
  ).find(
    (row) =>
      row.name === pin.name &&
      row.lat === pin.lat &&
      row.lng === pin.lng &&
      row.appleId === pin.appleId,
  )?.members ?? [pin];

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
  const undoPins = useRef<RevealPin[]>([]);
  const latest = useRef({ listed, staged, revealed, count: found.length });
  useEffect(() => {
    latest.current = { listed, staged, revealed, count: found.length };
  });
  const saved = useRef(new Set<RevealPin>());
  const queue = useRef(Promise.resolve(true));
  const left = useRef(false);
  const unsaved = (pins: RevealPin[]) =>
    pins.filter((pin) => !saved.current.has(pin));

  const shown = found.filter(
    (pin) => !staged.some((gone) => samePin(pin, gone)),
  );

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const persistOnce = async (pending: RevealPin[]) => {
    setUndo(null);
    let failure: unknown = null;
    for (const fresh of [false, true]) {
      try {
        const data = fresh
          ? await convex.query(api.placeCorrections.getPlaces, { itemId })
          : latest.current.listed;
        if (!data) continue;
        await savePlaces({
          itemId,
          version: data.version,
          places: keptPlaces(data.places, pending),
        });
        for (const pin of pending) saved.current.add(pin);
        setStaged((pins) => pins.filter((pin) => !pending.includes(pin)));
        return true;
      } catch (error) {
        failure = error;
      }
    }
    analytics.captureError("spots_removal_failed", failure);
    return false;
  };
  const persist = async () => {
    for (
      let pending = unsaved(latest.current.staged);
      pending.length > 0;
      pending = unsaved(latest.current.staged)
    ) {
      if (!(await persistOnce(pending))) return false;
    }
    return true;
  };
  const write = () => (queue.current = queue.current.then(persist));

  const leave = (via: SpotsExit) => {
    if (!left.current && latest.current.revealed) {
      left.current = true;
      analytics.capture("share_spots_left", {
        pin_count: latest.current.count,
        removed: saved.current.size + unsaved(latest.current.staged).length,
        via,
      });
    }
    void write();
  };
  const onUnmount = useRef(leave);
  useEffect(() => {
    onUnmount.current = leave;
  });
  useEffect(() => () => onUnmount.current("back"), []);

  return {
    shown,
    undo,
    remove: (pin: RevealPin) => {
      analytics.capture("share_spots_place_removed", {
        pin_count: found.length,
      });
      const added = rowOf(pin, shown);
      undoPins.current = added;
      setStaged((pins) => [...pins, ...added]);
      setUndo(pin);
    },
    restore: () => {
      if (!undo) return;
      analytics.capture("share_spots_place_restored", {
        pin_count: found.length,
      });
      const added = undoPins.current;
      setStaged((pins) => pins.filter((pin) => !added.includes(pin)));
      setUndo(null);
    },
    fix: async () => {
      analytics.capture("share_spots_fix_opened", {
        pin_count: found.length,
        staged_removals: unsaved(staged).length,
      });
      await write();
    },
    flush: write,
    leave,
  };
}
