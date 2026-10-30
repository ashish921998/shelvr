import { isStreetAddress } from "@convex/model/plan";
import { cityKey } from "@convex/model/trip";

/** How long the reveal waits for a save to be read and pinned before it gives up and goes Home. */
export const REVEAL_MAX_WAIT_MS = 25_000;
/** Pins land a moment after the save turns ready (the Apple Maps lookup runs then), so a ready save with a city waits this long for them. */
export const REVEAL_PIN_GRACE_MS = 10_000;

type RevealPin = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
};

export type RevealSave = {
  _id: string;
  status: string;
  cities?: string[];
  placePins?: RevealPin[];
};

export type Reveal =
  | { kind: "finding" }
  | { kind: "spots"; city: string; pins: RevealPin[] }
  | { kind: "none"; reason: "missing" | "failed" | "no_place" | "timeout" };

/** The city most of the pins sit in, or the save's first city when the pins carry none. */
function revealCity(save: RevealSave, pins: RevealPin[]): string | null {
  const counts = new Map<string, { name: string; count: number }>();
  for (const pin of pins) {
    if (!pin.city) continue;
    const key = cityKey(pin.city);
    const entry = counts.get(key) ?? { name: pin.city, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }
  let best: { name: string; count: number } | null = null;
  for (const entry of counts.values()) {
    if (best === null || entry.count > best.count) best = entry;
  }
  return best?.name ?? save.cities?.[0] ?? null;
}

/**
 * What the screen after a shared link shows: still finding, the spots in one city, or nothing worth
 * a screen (the caller then goes Home, as a share did before). `save` is undefined while loading and
 * null once the save is gone; `readyForMs` is how long it has been ready, 0 until then.
 */
export function revealFor(
  save: RevealSave | null | undefined,
  waitedMs: number,
  readyForMs: number,
): Reveal {
  if (save === null) return { kind: "none", reason: "missing" };
  if (save !== undefined) {
    if (save.status === "failed" || save.status === "unavailable") {
      return { kind: "none", reason: "failed" };
    }
    // A bare street address is usually a named spot's own address, pinned on top of it.
    const pins = (save.placePins ?? []).filter(
      (pin) => !isStreetAddress(pin.name),
    );
    // A list save is pinned before it settles, so wait for ready: more pins, or a failure, may follow.
    const city =
      save.status === "ready" && pins.length > 0
        ? revealCity(save, pins)
        : null;
    if (city !== null) {
      const key = cityKey(city);
      // Like the city page: a pin with no city belongs only to a single-city save.
      const single = (save.cities ?? []).length <= 1;
      const here = pins.filter((pin) =>
        pin.city ? cityKey(pin.city) === key : single,
      );
      if (here.length > 0) return { kind: "spots", city, pins: here };
    }
    if (save.status === "ready") {
      if ((save.cities ?? []).length === 0) {
        return { kind: "none", reason: "no_place" };
      }
      if (readyForMs >= REVEAL_PIN_GRACE_MS) {
        return { kind: "none", reason: "no_place" };
      }
    }
  }
  // A ready save is bounded by the pin grace above, so a late one still gets its full grace.
  return waitedMs >= REVEAL_MAX_WAIT_MS && save?.status !== "ready"
    ? { kind: "none", reason: "timeout" }
    : { kind: "finding" };
}
