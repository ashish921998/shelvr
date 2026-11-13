import { cache } from "react";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

const TIMEOUT_MS = 5_000;

export type PassportCity = { city?: string; names: string[] };

export type SharedPassport = {
  ownerName?: string;
  places: number;
  cities: number;
  countries: number | null;
  byCity: PassportCity[];
  mapUrl?: string;
};

type PassportResult =
  | { outcome: "found"; passport: SharedPassport }
  | { outcome: "missing" | "unavailable"; passport?: undefined };

function shareUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/passport/shares/${encodeURIComponent(token)}`;
}

async function fetchPassport(token: string): Promise<PassportResult> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return { outcome: "unavailable" };

  try {
    const response = await fetch(shareUrl(siteUrl, token), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) {
      serverLog("error", "passport_share_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    return {
      outcome: "found",
      passport: (await response.json()) as SharedPassport,
    };
  } catch (error) {
    serverLog("error", "passport_share_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export const loadPassport = cache(fetchPassport);

export async function recordPassportOpen(token: string): Promise<void> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return;
  try {
    const response = await fetch(shareUrl(siteUrl, token), {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) {
      serverLog("error", "passport_open_failed", { status: response.status });
    }
  } catch (error) {
    serverLog("error", "passport_open_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
  }
}

export function passportTitle(passport: SharedPassport | undefined): string {
  return passport?.ownerName
    ? `${passport.ownerName}’s passport`
    : "A Shelvr passport";
}

function plural(count: number, word: string, words: string): string {
  return `${count} ${count === 1 ? word : words}`;
}

export function passportSummary(passport: SharedPassport): string {
  return [
    plural(passport.places, "place", "places"),
    plural(passport.cities, "city", "cities"),
    ...(passport.countries === null
      ? []
      : [plural(passport.countries, "country", "countries")]),
  ].join(" · ");
}
