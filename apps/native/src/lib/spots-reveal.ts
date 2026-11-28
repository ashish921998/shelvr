import { isStreetAddress } from "@convex/model/plan";
import { cityKey } from "@convex/model/trip";

export const REVEAL_MAX_WAIT_MS = 25_000;
export const REVEAL_PIN_GRACE_MS = 10_000;

export type RevealPin = {
  name: string;
  lat: number;
  lng: number;
  city?: string;
  appleId?: string;
  category?: string;
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

export function pinsIn(save: RevealSave, city: string): RevealPin[] {
  const key = cityKey(city);
  const single = (save.cities ?? []).length <= 1;
  return (save.placePins ?? []).filter(
    (pin) =>
      !isStreetAddress(pin.name) &&
      (pin.city ? cityKey(pin.city) === key : single),
  );
}

export function samePin(
  pin: { name: string; lat?: number; lng?: number; appleId?: string },
  other: RevealPin,
): boolean {
  return pin.appleId && other.appleId
    ? pin.appleId === other.appleId
    : pin.name === other.name && pin.lat === other.lat && pin.lng === other.lng;
}

export function keptPlaces<
  Place extends { name: string; lat?: number; lng?: number; appleId?: string },
>(places: readonly Place[], removed: readonly RevealPin[]): Place[] {
  return places.filter((place) => !removed.some((pin) => samePin(place, pin)));
}

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
    const pins = (save.placePins ?? []).filter(
      (pin) => !isStreetAddress(pin.name),
    );
    const city =
      save.status === "ready" && pins.length > 0
        ? revealCity(save, pins)
        : null;
    if (city !== null) {
      const here = pinsIn(save, city);
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
  return waitedMs >= REVEAL_MAX_WAIT_MS && save?.status !== "ready"
    ? { kind: "none", reason: "timeout" }
    : { kind: "finding" };
}
