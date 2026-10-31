import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { holdIncomingShare } from "@/lib/onboarding-exit";
import { clearPending } from "@/lib/pending-onboarding";
import {
  clearPendingInvite,
  getPendingInvite,
  getPendingInviteRevision,
  subscribePendingInvite,
} from "@/lib/pending-invite";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useSyncExternalStore } from "react";

export type InviteJoinInput = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  inFlight: string | null;
};

export type InviteJoinStep = { kind: "wait" } | { kind: "join"; token: string };
export function inviteJoinStep(input: InviteJoinInput): InviteJoinStep {
  if (input.token === null || input.isLoading || !input.isAuthenticated) {
    return { kind: "wait" };
  }
  if (input.inFlight === input.token) return { kind: "wait" };
  return { kind: "join", token: input.token };
}

export type InviteJoinOutcome = {
  clearToken: boolean;
  completeOnboarding: boolean;
  href: string;
};
export function inviteJoinOutcome(
  listId: Id<"sharedLists"> | null,
  token: string,
  onboarded: boolean,
): InviteJoinOutcome {
  return {
    clearToken: true,
    completeOnboarding: !onboarded,
    href:
      listId === null
        ? `/list-invite/${encodeURIComponent(token)}`
        : `/shared-list/${listId}`,
  };
}
export function useInviteJoinCoordinator() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded, completeOnboarding } = useOnboarding();
  const join = useMutation(api.sharedLists.joinSharedList);
  const revision = useSyncExternalStore(
    subscribePendingInvite,
    getPendingInviteRevision,
    getPendingInviteRevision,
  );
  const token = getPendingInvite();
  const inFlight = useRef<string | null>(null);
  const onboardedRef = useRef(onboarded);
  useEffect(() => {
    onboardedRef.current = onboarded;
  }, [onboarded]);

  useEffect(() => {
    const step = inviteJoinStep({
      isLoading,
      isAuthenticated,
      token,
      inFlight: inFlight.current,
    });
    if (step.kind !== "join") return;
    inFlight.current = step.token;
    clearPending();
    join({ token: step.token })
      .then((listId) => {
        const outcome = inviteJoinOutcome(
          listId,
          step.token,
          onboardedRef.current,
        );
        analytics.capture("shared_list_joined", {
          joined: listId !== null,
          onboarded_before: !outcome.completeOnboarding,
        });
        if (outcome.clearToken) clearPendingInvite();
        if (outcome.completeOnboarding) {
          holdIncomingShare();
          completeOnboarding();
        }
        router.replace(outcome.href as never);
      })
      .catch((error: unknown) => {
        analytics.captureError("shared_list_join_failed", error);
      })
      .finally(() => {
        inFlight.current = null;
      });
  }, [
    isLoading,
    isAuthenticated,
    token,
    revision,
    join,
    completeOnboarding,
    router,
  ]);
}
