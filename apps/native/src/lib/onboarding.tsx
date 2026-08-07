import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useMemo, useState } from 'react';

const ONBOARDING_KEY = 'shelvr.onboarded';

type OnboardingContextValue = {
  onboarded: boolean;
  completeOnboarding: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue>({
  onboarded: true,
  completeOnboarding: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [onboarded, setOnboarded] = useState(() => {
    return SecureStore.getItem(ONBOARDING_KEY) === 'true';
  });

  const completeOnboarding = useCallback(() => {
    SecureStore.setItem(ONBOARDING_KEY, 'true');
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
