import { withoutCitySuffix } from "@convex/model/itemFields";
import { isStreetAddress, splitSavedPlace } from "@convex/model/plan";
import { cityKey, distanceKm, SAME_PLACE_KM } from "@convex/model/trip";

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

export type StagedPin = RevealPin & { otherVenues?: string[] };

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
  removed: StagedPin,
): boolean {
  if (removed.appleId) return pin.appleId === removed.appleId;
  return (
    pin.name === removed.name &&
    pin.lat === removed.lat &&
    pin.lng === removed.lng &&
    !(pin.appleId && removed.otherVenues?.includes(pin.appleId))
  );
}

export function followMovedPins(
  staged: readonly StagedPin[],
  found: readonly RevealPin[],
  before: readonly RevealPin[],
): void {
  const at = (a: RevealPin, b: RevealPin) =>
    a.name === b.name && a.lat === b.lat && a.lng === b.lng;
  for (const pin of staged) {
    if (pin.appleId || found.some((other) => samePin(other, pin))) continue;
    const moved = found.find(
      (other) =>
        other.name === pin.name &&
        !before.some((old) =>
          other.appleId ? old.appleId === other.appleId : at(old, other),
        ) &&
        !(other.appleId && pin.otherVenues?.includes(other.appleId)) &&
        distanceKm(other, pin) <= SAME_PLACE_KM,
    );
    if (moved) Object.assign(pin, { lat: moved.lat, lng: moved.lng });
  }
}

export function pinnedOnly(
  places: readonly { name: string; lat?: number; lng?: number }[],
): RevealPin[] {
  return places.flatMap((place) =>
    place.lat !== undefined && place.lng !== undefined
      ? [{ ...place, lat: place.lat, lng: place.lng }]
      : [],
  );
}

export function keptPlaces<
  Place extends {
    name: string;
    lat?: number;
    lng?: number;
    appleId?: string;
    city?: string;
  },
>(places: readonly Place[], removed: readonly StagedPin[]): Place[] {
  const labels = (pin: StagedPin) =>
    places.filter((place) => place.lat === undefined && labelOf(place, pin));
  const otherBranches = (place: Place, pin: StagedPin) =>
    !splitSavedPlace(pin.name).area &&
    branchOf(place, pin) !== "" &&
    new Set(
      labels(pin)
        .map((label) => branchOf(label, pin))
        .filter(Boolean),
    ).size > 1;
  return places.filter(
    (place) =>
      !removed.some(
        (pin) =>
          samePin(place, pin) ||
          (place.lat === undefined &&
            labelOf(place, pin) &&
            !otherBranches(place, pin)),
      ),
  );
}

function branchOf(entry: { name: string }, removed: RevealPin): string {
  const { area } = splitSavedPlace(entry.name.toLowerCase());
  if (!removed.city) return area;
  if (cityKey(area) === cityKey(removed.city)) return "";
  return withoutCitySuffix(area, removed.city) ?? area;
}

function labelOf(
  entry: { name: string; city?: string },
  removed: RevealPin,
): boolean {
  const place = splitSavedPlace(entry.name.toLowerCase());
  const pin = splitSavedPlace(removed.name.toLowerCase());
  if (place.name !== pin.name) return false;
  const inPinCity = (city: string | undefined) =>
    city !== undefined &&
    (!removed.city || cityKey(city) === cityKey(removed.city));
  const area = removed.city && withoutCitySuffix(place.area, removed.city);
  if (pin.area) return pin.area === (area || place.area);
  return (
    inPinCity(entry.city) ||
    (!!removed.city && (!!area || inPinCity(place.area)))
  );
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
