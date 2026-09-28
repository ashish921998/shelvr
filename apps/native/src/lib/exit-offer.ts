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

/** At most one exit offer per account per week. */
export const EXIT_OFFER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
    return ids.some((id) => eligibility[id]?.status === INTRO_ELIGIBLE)
      ? offering
      : null;
  } catch {
    return null;
  }
}
