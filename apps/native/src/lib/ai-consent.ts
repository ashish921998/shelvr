import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback } from "react";

type AiConsentStatus =
  | "signed-out"
  | "loading"
  | "unset"
  | "granted"
  | "declined";

export function useAiConsent() {
  const { isAuthenticated } = useConvexAuth();
  const { data } = useQuery(
    convexQuery(api.aiConsent.getStatus, isAuthenticated ? {} : "skip"),
  );
  const setConsent = useMutation(api.aiConsent.setConsent);
  const status: AiConsentStatus = !isAuthenticated
    ? "signed-out"
    : (data?.status ?? "loading");

  const answer = useCallback(
    async (granted: boolean, surface: "settings") => {
      await setConsent({ granted });
      analytics.capture("ai_consent_answered", { granted, surface });
    },
    [setConsent],
  );

  return {
    status,
    answer,
  };
}
