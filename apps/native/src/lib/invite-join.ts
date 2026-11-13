import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { holdIncomingShare } from "@/lib/onboarding-exit";
import { clearPending } from "@/lib/pending-onboarding";
import {
  clearPendingInvite,
  getPendingInvite,
  type PendingInvite,
  pendingInviteOf,
  subscribePendingInvite,
} from "@/lib/pending-invite";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Alert } from "react-native";

type InviteJoinInput = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  inFlight: string | null;
};

type InviteJoinStep = { kind: "wait" } | (PendingInvite & { raw: string });
export function inviteJoinStep(input: InviteJoinInput): InviteJoinStep {
  if (input.token === null || input.isLoading || !input.isAuthenticated) {
    return { kind: "wait" };
  }
  if (input.inFlight === input.token) return { kind: "wait" };
  return { ...pendingInviteOf(input.token), raw: input.token };
}

type InviteResolution = { found: boolean; href: string };

export function listResolution(
  listId: Id<"sharedLists"> | null,
  token: string,
): InviteResolution {
  return listId === null
    ? { found: false, href: `/list-invite/${encodeURIComponent(token)}` }
    : { found: true, href: `/shared-list/${listId}?joined=1` };
}

export function passportResolution(
  found: boolean,
  token: string,
): InviteResolution {
  const href = `/passport-invite/${encodeURIComponent(token)}`;
  return { found, href: found ? `${href}?compare=1` : href };
}

export function inviteJoinOutcome(
  resolution: InviteResolution,
  onboarded: boolean,
): { completeOnboarding: boolean; href: string } {
  return {
    completeOnboarding: resolution.found && !onboarded,
    href: resolution.href,
  };
}

export function useInviteJoinCoordinator() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { onboarded, completeOnboarding } = useOnboarding();
  const join = useMutation(api.sharedLists.joinSharedList);
  const convex = useConvex();
  const token = useSyncExternalStore(
    subscribePendingInvite,
    getPendingInvite,
    getPendingInvite,
  );
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
    if (step.kind === "wait") return;
    inFlight.current = step.raw;
    const onboardedBefore = onboardedRef.current;
    const resolve =
      step.kind === "list"
        ? join({ token: step.token }).then((listId) => {
            analytics.capture("shared_list_joined", {
              joined: listId !== null,
              onboarded_before: onboardedBefore,
            });
            return listResolution(listId, step.token);
          })
        : convex
            .query(api.passportShares.passportPreview, { token: step.token })
            .then((passport) => {
              analytics.capture("passport_compare_resumed", {
                found: passport !== null,
                onboarded_before: onboardedBefore,
              });
              return passportResolution(passport !== null, step.token);
            });
    resolve
      .then((resolution) => {
        const outcome = inviteJoinOutcome(resolution, onboardedRef.current);
        clearPendingInvite();
        if (outcome.completeOnboarding) {
          holdIncomingShare();
          clearPending();
          completeOnboarding();
        }
        router.replace(outcome.href as never);
      })
      .catch((error: unknown) => {
        clearPendingInvite();
        if (step.kind === "list") {
          analytics.captureError("shared_list_join_failed", error);
          Alert.alert(t("sharedLists.joinFailed"));
          return;
        }
        analytics.captureError("passport_resume_failed", error);
        Alert.alert(t("errors.unexpectedTitle"), t("errors.retrySoon"));
      })
      .finally(() => {
        inFlight.current = null;
      });
  }, [
    isLoading,
    isAuthenticated,
    token,
    join,
    convex,
    completeOnboarding,
    router,
  ]);
}
