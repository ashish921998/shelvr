import { api } from "@convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useOnboarding } from "@/lib/onboarding";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  dropFirstSaveNotFor,
  firstSaveDone,
  forgetPaywallAnswer,
  handoffRevision,
  noteReplayDeclined,
  paywallBlocked,
  readHandoffWork,
  settleHandoff,
  subscribeHandoff,
} from "@/lib/onboarding-handoff";
import {
  getPurchaseBeforeSignInRevision,
  hasPurchaseBeforeSignIn,
  subscribePurchaseBeforeSignIn,
} from "@/lib/purchase-before-sign-in";
import {
  openPaywallAnswer,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import {
  finishReplay,
  initialReplay,
  observeReplay,
} from "@/lib/replay-onboarding-machine";

const NO_WORK = { has: false, key: "" };

/** Mount once: after onboarding and sign-in, shows the paywall and saves the queued sample reel. */
export function useReplayOnboarding(
  freeSaves: { left: boolean; loading: boolean } = {
    left: false,
    loading: false,
  },
) {
  const { isAuthenticated } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const { data: user } = useCurrentUser();
  const accountLoaded = user != null;
  const userId = user?._id ?? null;
  const router = useRouter();
  const entitlement = useEntitlement();
  const entitled = entitlement.entitled || freeSaves.left;
  const entitlementLoading = entitlement.loading || freeSaves.loading;
  const createSpace = useMutation(api.spaces.createSpace);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const machine = useRef(initialReplay(entitled));
  const [retryNonce, setRetryNonce] = useState(0);
  const accountRef = useRef<string | null>(null);
  useEffect(() => {
    accountRef.current = isAuthenticated ? userId : null;
    return () => {
      accountRef.current = null;
    };
  }, [isAuthenticated, userId]);
  const pendingRevision = useSyncExternalStore(
    subscribeHandoff,
    handoffRevision,
    handoffRevision,
  );
  const purchaseRevision = useSyncExternalStore(
    subscribePurchaseBeforeSignIn,
    getPurchaseBeforeSignInRevision,
    getPurchaseBeforeSignInRevision,
  );

  useEffect(() => {
    const step = observeReplay(machine.current, {
      ready:
        isAuthenticated && accountLoaded && onboarded && !entitlementLoading,
      entitled,
      paywallBlocked: paywallBlocked() || hasPurchaseBeforeSignIn(),
      readPending: () =>
        dropFirstSaveNotFor(userId) ? readHandoffWork() : NO_WORK,
    });
    machine.current = step.state;
    if (step.action === "none") return;
    if (step.action === "save") forgetPaywallAnswer();

    const work = readHandoffWork();
    const demo = work.firstSave;

    let purchased = false;
    let remainderKey: string | null = null;
    let lateDemoUrl = false;
    const runAccount = userId;
    let accountChanged = false;
    const sameAccount = () => {
      if (runAccount !== null && accountRef.current === runAccount) return true;
      accountChanged = true;
      return false;
    };
    const run = async () => {
      try {
        if (step.action === "sell") {
          await waitForSheetTransition();
          const { outcome, answered } = await openPaywallAnswer(
            router,
            "onboarding",
            { fallback: true },
          );
          purchased = outcome === "success";
          if (outcome === "cancelled" && answered)
            noteReplayDeclined(work.operationId);
          return;
        }

        if (!sameAccount()) return;

        remainderKey = work.key;

        if (demo && work.operationId !== null) {
          if (!sameAccount()) return;
          try {
            const spaceId =
              demo.space === null
                ? undefined
                : await createSpace({ name: demo.space, dynamic: true });
            if (!sameAccount()) return;
            await createLinkItem({
              url: demo.url,
              spaceId,
              operationId: work.operationId,
              analyticsSessionId: analytics.sessionId(),
              saveSource: "onboarding_demo",
            });
          } catch (error) {
            analytics.captureError("onboarding_demo_save_failed", error);
            return;
          }
          if (!firstSaveDone(work.operationId)) return;
        }

        if (!sameAccount()) return;

        if (settleHandoff(work) === "changed") lateDemoUrl = true;
      } finally {
        const done = finishReplay(machine.current, {
          purchased,
          remainderKey,
          lateDemoUrl,
          accountChanged,
          pending: readHandoffWork(),
        });
        machine.current = done.state;
        if (done.rerun) setRetryNonce((nonce) => nonce + 1);
      }
    };

    void run();
  }, [
    isAuthenticated,
    accountLoaded,
    userId,
    onboarded,
    createSpace,
    createLinkItem,
    entitled,
    entitlementLoading,
    pendingRevision,
    purchaseRevision,
    router,
    retryNonce,
  ]);
}
