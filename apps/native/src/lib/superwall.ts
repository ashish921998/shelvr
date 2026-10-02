import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type {
  CustomerInfo,
  PurchasesError,
  SubscriptionOption,
} from "react-native-purchases";
import type * as SuperwallSDK from "expo-superwall/compat";
import { analytics } from "@/lib/analytics";
import { getPurchases } from "@/lib/revenuecat-module";

/**
 * Superwall, installed beside RevenueCat.
 *
 * RevenueCat stays the purchase engine and, for now, the paywall: every
 * placement still opens RevenueCat's paywall (see `presentPaywallImpl` in
 * entitlement.ts), and this module registers no Superwall placements. What it
 * does is ship the native SDK in the store build, so moving a placement onto a
 * Superwall paywall later is a JS-only update:
 *
 * - configures Superwall with RevenueCat as its purchase controller, so a
 *   Superwall paywall would buy and restore through RevenueCat and the
 *   RevenueCat webhook keeps writing the Convex `subscriptions` row;
 * - identifies the same Convex user id RevenueCat is logged in as;
 * - mirrors RevenueCat's active entitlements into Superwall's subscription
 *   status, which only decides whether Superwall would show a paywall. Access
 *   is still decided by Convex, never by either SDK.
 *
 * Production builds only, like RevenueCat's store keys: dev and preview users
 * would otherwise land in the production Superwall project. Every call is
 * best-effort and never blocks or fails a RevenueCat flow.
 */

type Superwall = typeof SuperwallSDK;
type Purchases = NonNullable<ReturnType<typeof getPurchases>>;

/** Public SDK keys for the "Shelvr: Save & Organize Later" Superwall project. */
const SUPERWALL_KEYS = {
  ios: "pk_Z4XtXjUCvy8Xw6tyjeGpM",
  android: "pk_aqYuXjC-Wy4zborO4U2RW",
} as const;

function selectSuperwallApiKey(): string | undefined {
  if (Constants.expoConfig?.extra?.variant !== "production") return undefined;
  if (Platform.OS === "ios") return SUPERWALL_KEYS.ios;
  if (Platform.OS === "android") return SUPERWALL_KEYS.android;
  return undefined;
}

export const SUPERWALL_API_KEY = selectSuperwallApiKey();

/**
 * Loads the compat SDK only once its native module is linked. The package
 * reads the native module at import time, so a binary without it (Expo Go, or
 * a JS bundle running on an older store build) must never import it.
 */
async function loadSuperwall(): Promise<Superwall | null> {
  if (!requireOptionalNativeModule("SuperwallExpo")) return null;
  try {
    return await import("expo-superwall/compat");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// RevenueCat purchase controller
// ---------------------------------------------------------------------------

function purchaseError(rc: Purchases, error: unknown) {
  const code = (error as Partial<PurchasesError> | null)?.code;
  if (
    (error as { userCancelled?: boolean } | null)?.userCancelled ||
    code === rc.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return "cancelled" as const;
  }
  if (code === rc.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return "pending" as const;
  }
  return "failed" as const;
}

/**
 * Picks the Google Play subscription option Superwall asked for: the exact
 * offer when one is named, else the base plan itself. Never another offer on
 * the same base plan, so the price shown on a paywall is the price charged.
 */
export function findSubscriptionOption(
  options: readonly SubscriptionOption[],
  basePlanId: string | undefined,
  offerId: string | undefined,
): SubscriptionOption | null {
  if (!basePlanId) return null;
  const id = offerId ? `${basePlanId}:${offerId}` : basePlanId;
  return (
    options.find(
      (option) => option.id === id && (offerId ? true : option.isBasePlan),
    ) ?? null
  );
}

/**
 * Superwall's PurchaseController backed by RevenueCat. Superwall calls it
 * only from one of its own paywalls; RevenueCat's paywall buys on its own.
 */
export function createRevenueCatPurchaseController(
  sw: Superwall,
  rc: Purchases,
): SuperwallSDK.PurchaseController {
  const settle = (error: unknown) => {
    const kind = purchaseError(rc, error);
    if (kind === "cancelled") return new sw.PurchaseResultCancelled();
    if (kind === "pending") return new sw.PurchaseResultPending();
    reportSuperwallError("superwall_purchase_failed", error);
    return new sw.PurchaseResultFailed("purchase_failed");
  };
  return {
    async purchaseFromAppStore(productId) {
      try {
        const [product] = await rc.getProducts([productId]);
        if (!product) return new sw.PurchaseResultFailed("product_not_found");
        await rc.purchaseStoreProduct(product);
        return new sw.PurchaseResultPurchased();
      } catch (error) {
        return settle(error);
      }
    },
    async purchaseFromGooglePlay(productId, basePlanId, offerId) {
      try {
        // RevenueCat queries Play subscriptions by subscription id alone.
        const [subscriptionId, idBasePlan] = productId.split(":");
        const products = await rc.getProducts(
          [subscriptionId],
          rc.PRODUCT_CATEGORY.SUBSCRIPTION,
        );
        const option = findSubscriptionOption(
          products.flatMap((product) => product.subscriptionOptions ?? []),
          basePlanId ?? idBasePlan,
          offerId,
        );
        if (!option) return new sw.PurchaseResultFailed("product_not_found");
        await rc.purchaseSubscriptionOption(option);
        return new sw.PurchaseResultPurchased();
      } catch (error) {
        return settle(error);
      }
    },
    async restorePurchases() {
      try {
        await rc.restorePurchases();
        return sw.RestorationResult.restored();
      } catch (error) {
        reportSuperwallError("superwall_restore_failed", error);
        return sw.RestorationResult.failed();
      }
    },
  };
}

/** RevenueCat's active entitlements, as Superwall's subscription status. */
export function subscriptionStatusFor(
  sw: Superwall,
  info: Pick<CustomerInfo, "entitlements">,
): SuperwallSDK.SubscriptionStatus {
  const active = Object.keys(info.entitlements.active);
  return active.length > 0
    ? sw.SubscriptionStatus.Active(active)
    : sw.SubscriptionStatus.Inactive();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let configured: Promise<Superwall | null> | null = null;
let identifiedUserId: string | null = null;
// Identity changes run one at a time, in call order, like RevenueCat's.
let queue = Promise.resolve();

function reportSuperwallError(event: string, error: unknown) {
  analytics.captureError(event, error, { provider: "superwall" });
}

function configureSuperwall(apiKey: string, rc: Purchases) {
  configured ??= (async () => {
    const sw = await loadSuperwall();
    if (!sw) return null;
    await sw.default.configure({
      apiKey,
      purchaseController: createRevenueCatPurchaseController(sw, rc),
      // No placement opens a Superwall paywall yet, so don't download any.
      options: { paywalls: { shouldPreload: false } },
    });
    rc.addCustomerInfoUpdateListener((info) => {
      void sw.default.shared
        .setSubscriptionStatus(subscriptionStatusFor(sw, info))
        .catch((error) =>
          reportSuperwallError("superwall_status_failed", error),
        );
    });
    return sw;
  })().catch((error) => {
    // A failed configure may be retried on the next sign-in or foreground.
    configured = null;
    throw error;
  });
  return configured;
}

function enqueue(task: () => Promise<void>, event: string): Promise<void> {
  const run = queue
    .then(task)
    .catch((error) => reportSuperwallError(event, error));
  queue = run;
  return run;
}

/**
 * Point Superwall at the user RevenueCat is logged in as. Call only after
 * RevenueCat identity sync is ready, so the purchase controller always buys
 * for the right account.
 */
export function syncSuperwallUser(userId: string): Promise<void> {
  const apiKey = SUPERWALL_API_KEY;
  if (!apiKey) return Promise.resolve();
  return enqueue(async () => {
    const rc = getPurchases();
    if (!rc) return;
    const sw = await configureSuperwall(apiKey, rc);
    if (!sw) return;
    const shared = sw.default.shared;
    if (identifiedUserId !== userId) {
      // A different account must not inherit the last one's assignments.
      if (identifiedUserId !== null) await shared.reset();
      await shared.identify({ userId });
      identifiedUserId = userId;
    }
    await shared.setSubscriptionStatus(
      subscriptionStatusFor(sw, await rc.getCustomerInfo()),
    );
  }, "superwall_identity_sync_failed");
}

/** Forget the signed-out user. A no-op until Superwall has been configured. */
export function resetSuperwallUser(): Promise<void> {
  return enqueue(async () => {
    if (identifiedUserId === null || !configured) return;
    const sw = await configured;
    if (!sw) return;
    await sw.default.shared.reset();
    await sw.default.shared.setSubscriptionStatus(
      sw.SubscriptionStatus.Inactive(),
    );
    identifiedUserId = null;
  }, "superwall_reset_failed");
}
