/**
 * The exit offer: a second, cheaper paywall shown once when someone closes
 * the main paywall without buying. It is its own RevenueCat offering holding
 * an annual product whose App Store introductory offer is a discounted first
 * year, so the price, copy and design all live in RevenueCat and App Store
 * Connect. Until that offering exists the lookup finds nothing and the close
 * behaves exactly as before.
 *
 * Kept free of native imports (like `paywall-result.ts`) so the decision is
 * unit-testable; `entitlement.ts` supplies the RevenueCat calls.
 */

/** Offering identifier in the RevenueCat dashboard. */
export const EXIT_OFFERING_ID = "exit_offer";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Once shown, the offer stays open for this long: Home counts it down and can
 * reopen it. When the window closes the offer is really gone, so the
 * countdown never lies (Apple rejects fake urgency).
 */
export const EXIT_OFFER_WINDOW_MS = 24 * HOUR_MS;

/** An expired offer does not come back for a month, keeping the deadline honest. */
export const EXIT_OFFER_COOLDOWN_MS = 30 * 24 * HOUR_MS;

// A retry follows a failed load, not a decision to leave.
const SKIPPED_PLACEMENTS = new Set(["retry"]);

// INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE in
// react-native-purchases. Mirrored here so this module stays native-free.
const INTRO_ELIGIBLE = 2;

export const exitOfferShownKey = (userId: string) =>
  `shelvr.exitOffer.shownAt.${userId}`;

export function exitOfferDue(
  placement: string,
  lastShownAt: number | null,
  now: number,
): boolean {
  if (SKIPPED_PLACEMENTS.has(placement)) return false;
  return lastShownAt === null || now - lastShownAt >= EXIT_OFFER_COOLDOWN_MS;
}

/** When the open offer closes, or null when no offer is open. */
export function exitOfferEndsAt(
  shownAt: number | null,
  now: number,
): number | null {
  if (shownAt === null) return null;
  const endsAt = shownAt + EXIT_OFFER_WINDOW_MS;
  return now < endsAt ? endsAt : null;
}

/** Whole hours and minutes left, rounded down so it never overstates. */
export function timeLeft(ms: number): { hours: number; minutes: number } {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** "23:05:09" for the time left; never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/** Parses the stored timestamp; anything unreadable counts as never shown. */
export function parseShownAt(value: string | null): number | null {
  if (!value) return null;
  const at = Number(value);
  return Number.isFinite(at) ? at : null;
}

type ExitOffering = {
  availablePackages: {
    product: { identifier: string; introPrice: unknown };
  }[];
};

/**
 * The exit offering, or null when it is missing or the discount would not
 * apply. Apple grants an introductory offer once per subscription group, so
 * someone who already had the annual trial would only see full price; for
 * them the exit offer is skipped rather than shown without its discount.
 *
 * iOS only for now: RevenueCat's eligibility check reports "unknown" on
 * Android, so the offer never shows there until a Play offer is set up.
 */
export async function findExitOffering<O extends ExitOffering>(deps: {
  getOfferings: () => Promise<{ all: Record<string, O> }>;
  checkEligibility: (
    productIds: string[],
  ) => Promise<Record<string, { status: number }>>;
}): Promise<O | null> {
  try {
    const offering = (await deps.getOfferings()).all[EXIT_OFFERING_ID];
    if (!offering) return null;
    const ids = offering.availablePackages
      .filter((pkg) => pkg.product.introPrice != null)
      .map((pkg) => pkg.product.identifier);
    if (ids.length === 0) return null;
    const eligibility = await deps.checkEligibility(ids);
    // Every discounted package must qualify, so the sheet never shows a
    // plan without the price it promises.
    return ids.every((id) => eligibility[id]?.status === INTRO_ELIGIBLE)
      ? offering
      : null;
  } catch {
    return null;
  }
}
