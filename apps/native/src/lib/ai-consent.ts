import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect } from "react";
import { createMMKV } from "react-native-mmkv";

const store = createMMKV({ id: "ai-consent" });
const ANSWERED_KEY = "answered";

type AiConsentStatus =
  | "signed-out"
  | "loading"
  | "unset"
  | "granted"
  | "declined";

function savesBlocked(
  status: AiConsentStatus,
  answeredBefore: boolean,
): boolean {
  return status === "unset" || (status === "loading" && !answeredBefore);
}

export function useAiConsent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data } = useQuery(
    convexQuery(api.aiConsent.getStatus, isAuthenticated ? {} : "skip"),
  );
  const setConsent = useMutation(api.aiConsent.setConsent);
  const status: AiConsentStatus = !isAuthenticated
    ? "signed-out"
    : (data?.status ?? "loading");

  const answered = status === "granted" || status === "declined";
  useEffect(() => {
    if (answered) store.set(ANSWERED_KEY, true);
    else if (status === "unset" || (status === "signed-out" && !isLoading))
      store.remove(ANSWERED_KEY);
  }, [answered, status, isLoading]);

  const answer = useCallback(
    async (granted: boolean, surface: "card" | "settings") => {
      await setConsent({ granted });
      analytics.capture("ai_consent_answered", { granted, surface });
    },
    [setConsent],
  );

  return {
    status,
    asking: status === "unset",
    savesBlocked: savesBlocked(status, store.getBoolean(ANSWERED_KEY) === true),
    answer,
  };
}
