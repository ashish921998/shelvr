import { analytics } from "@/lib/analytics";
import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useMemo, useState } from "react";

const ONBOARDING_KEY = "shelvr.onboarded";

export function readOnboardedFlag(): boolean {
  try {
    return SecureStore.getItem(ONBOARDING_KEY) === "true";
  } catch (error) {
    analytics.captureError("onboarded_flag_read_failed", error);
    return true;
  }
}

// SecureStore's delete is async-only, so clearing writes "".
export function forgetOnboarded(): void {
  SecureStore.setItem(ONBOARDING_KEY, "");
}

type OnboardingContextValue = {
  onboarded: boolean;
  completeOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue>({
  onboarded: true,
  completeOnboarding: () => {},
});

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [onboarded, setOnboarded] = useState(readOnboardedFlag);

  const completeOnboarding = useCallback(() => {
    try {
      SecureStore.setItem(ONBOARDING_KEY, "true");
    } catch (error) {
      analytics.captureError("onboarded_flag_write_failed", error);
    }
    setOnboarded(true);
  }, []);

  const value = useMemo(
    () => ({ onboarded, completeOnboarding }),
    [onboarded, completeOnboarding],
  );

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboarding() {
  return use(OnboardingContext);
}
