import { analytics } from "@/lib/analytics";
import type { TextMessageKey } from "@/locales/message-types";

/**
 * The onboarding "How did you hear about Shelvr?" answer.
 *
 * Ids are stable analytics values: rename a label freely, never an id. Brand
 * names are not translated, so they live here rather than in the catalogs.
 * The answer goes to PostHog only (an event plus a person property); it is
 * never stored in Convex.
 */
export const ACQUISITION_SOURCES = [
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "reddit",
  "friend",
  "store_search",
  "other",
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

const SOCIAL_SOURCES = [
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "reddit",
] as const satisfies readonly AcquisitionSource[];
const TRAILING_SOURCES = [
  "friend",
  "store_search",
  "other",
] as const satisfies readonly AcquisitionSource[];

type SourceLabel =
  | { kind: "brand"; text: string }
  | { kind: "message"; key: TextMessageKey };

export function sourceLabel(
  source: AcquisitionSource,
  os: string | undefined,
): SourceLabel {
  switch (source) {
    case "tiktok":
      return { kind: "brand", text: "TikTok" };
    case "instagram":
      return { kind: "brand", text: "Instagram" };
    case "youtube":
      return { kind: "brand", text: "YouTube" };
    case "x":
      return { kind: "brand", text: "X (Twitter)" };
    case "reddit":
      return { kind: "brand", text: "Reddit" };
    case "friend":
      return { kind: "message", key: "onboarding.sourceFriend" };
    case "store_search":
      return {
        kind: "message",
        key:
          os === "android"
            ? "onboarding.sourceGooglePlay"
            : "onboarding.sourceAppStore",
      };
    case "other":
      return { kind: "message", key: "onboarding.sourceOther" };
  }
}

/**
 * Social networks are shuffled so the first row does not collect taps by
 * position; the friend, store and "somewhere else" rows stay last.
 */
export function orderAcquisitionSources(
  random: () => number = Math.random,
): AcquisitionSource[] {
  const social: AcquisitionSource[] = [...SOCIAL_SOURCES];
  for (let i = social.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [social[i], social[j]] = [social[j], social[i]];
  }
  return [...social, ...TRAILING_SOURCES];
}

export const acquisitionSourceAnalytics = {
  answered(source: AcquisitionSource, position: number): void {
    analytics.capture("acquisition_source_answered", {
      source,
      position,
      // $set_once keeps the first answer if onboarding is ever replayed.
      $set_once: { acquisition_source: source },
    });
  },

  skipped(): void {
    analytics.capture("acquisition_source_skipped");
  },
};
