import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { createMMKV } from "react-native-mmkv";

// Remembers that this install has an answer on record, so a launch does not
// wait on the network (or hang offline) to show the app to someone who
// already chose. The server still decides what happens to each save.
const store = createMMKV({ id: "ai-consent" });
const ANSWERED_KEY = "answered";
// Set when a sign-in starts from a screen that carries the AI disclosure
// (every sign-in surface does). Signing in there is the user's yes, so the
// separate card is only for people who were already signed in.
const DISCLOSED_KEY = "disclosed-at-sign-in";

export function markAiDisclosedAtSignIn(): void {
  store.set(DISCLOSED_KEY, true);
}

type AiConsentStatus =
  | "signed-out"
  | "loading"
  | "unset"
  | "granted"
  | "declined";

/**
 * The one rule for third-party AI consent: a signed-in user must answer
 * before any save is created. A save sends its content to Google's Gemini,
 * so nothing may be saved while the answer is not given (`unset`) or, on an
 * install that has never recorded one, still unknown (`loading`, which
 * includes a failed read). Signed out there is no save to hold back.
 */
function savesBlocked(
  status: AiConsentStatus,
  answeredBefore: boolean,
): boolean {
  return status === "unset" || (status === "loading" && !answeredBefore);
}

export function useAiConsent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // The React Query adapter, not convex/react: a read that fails during a
  // token refresh must not throw into the layout that renders this.
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
    // Auth still restoring reads as signed out; that must not forget the answer.
    else if (status === "unset" || (status === "signed-out" && !isLoading))
      store.remove(ANSWERED_KEY);
  }, [answered, status, isLoading]);

  // Read every render: MMKV is synchronous, and the effect below clears it.
  const disclosed = store.getBoolean(DISCLOSED_KEY) === true;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (answered) store.remove(DISCLOSED_KEY);
    if (status !== "unset" || !disclosed) return;
    setConsent({ granted: true }).then(
      () =>
        analytics.capture("ai_consent_answered", {
          granted: true,
          surface: "sign_in",
        }),
      // Not recorded: fall back to asking with the card.
      () => {
        store.remove(DISCLOSED_KEY);
        rerender((n) => n + 1);
      },
    );
  }, [answered, status, disclosed, setConsent]);

  /** Rejects when the answer was not recorded; the caller shows that. */
  const answer = useCallback(
    async (granted: boolean, surface: "card" | "settings") => {
      await setConsent({ granted });
      analytics.capture("ai_consent_answered", { granted, surface });
    },
    [setConsent],
  );

  return {
    status,
    /** True when the card should be shown: no answer, and none on its way. */
    asking: status === "unset" && !disclosed,
    savesBlocked: savesBlocked(status, store.getBoolean(ANSWERED_KEY) === true),
    answer,
  };
}
