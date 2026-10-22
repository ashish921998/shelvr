import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createMMKV } from "react-native-mmkv";

const store = createMMKV({ id: "ai-consent" });
const ANSWERED_KEY = "answered";
const DISCLOSED_KEY = "disclosed-at-sign-in";

const disclosedListeners = new Set<() => void>();
function subscribeDisclosed(listener: () => void): () => void {
  disclosedListeners.add(listener);
  return () => void disclosedListeners.delete(listener);
}
function readDisclosed(): boolean {
  return store.getBoolean(DISCLOSED_KEY) === true;
}
function setDisclosed(value: boolean): void {
  if (readDisclosed() === value) return;
  if (value) store.set(DISCLOSED_KEY, true);
  else store.remove(DISCLOSED_KEY);
  disclosedListeners.forEach((listener) => listener());
}

export function markAiDisclosedAtSignIn(): void {
  setDisclosed(true);
}

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

let grantInFlight = false;

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

  const disclosed = useSyncExternalStore(subscribeDisclosed, readDisclosed);
  useEffect(() => {
    if (answered) setDisclosed(false);
    if (status !== "unset" || !disclosed || grantInFlight) return;
    grantInFlight = true;
    setConsent({ granted: true })
      .finally(() => {
        grantInFlight = false;
      })
      .then(
        () =>
          analytics.capture("ai_consent_answered", {
            granted: true,
            surface: "sign_in",
          }),
        () => setDisclosed(false),
      );
  }, [answered, status, disclosed, setConsent]);

  const answer = useCallback(
    async (granted: boolean, surface: "card" | "settings") => {
      await setConsent({ granted });
      analytics.capture("ai_consent_answered", { granted, surface });
    },
    [setConsent],
  );

  return {
    status,
    asking: status === "unset" && !disclosed,
    savesBlocked: savesBlocked(status, store.getBoolean(ANSWERED_KEY) === true),
    answer,
  };
}
