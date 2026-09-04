import { requireOptionalNativeModule } from 'expo-modules-core';

export type ActivationPalProperties = Record<string, string | boolean | number>;

type ActivationPalNativeModule = {
  configure: (app: string, key: string, userId?: string) => void;
  setUserId: (userId?: string) => void;
  track: (name: string, properties?: ActivationPalProperties) => void;
  onboardingStep: (index: number, id: string, answer?: string) => void;
  onboardingCompleted: () => void;
  paywallShown: (placement: string, presentedAt: number) => void;
  paywallPlanSelected: (plan: string) => void;
  paywallPurchased: (plan: string) => void;
  paywallDismissed: () => void;
};

const nativeModule =
  requireOptionalNativeModule<ActivationPalNativeModule>('ActivationPal');

function safely(call: (module: ActivationPalNativeModule) => void): void {
  if (!nativeModule) return;
  try {
    call(nativeModule);
  } catch {
    // Analytics must never affect the product action being measured.
  }
}

export const activationPal = {
  configure(app: string, key: string, userId?: string) {
    safely((module) => module.configure(app, key, userId));
  },
  setUserId(userId?: string) {
    safely((module) => module.setUserId(userId));
  },
  track(name: string, properties?: ActivationPalProperties) {
    safely((module) => module.track(name, properties));
  },
  onboardingStep(index: number, id: string, answer?: string) {
    safely((module) => module.onboardingStep(index, id, answer));
  },
  onboardingCompleted() {
    safely((module) => module.onboardingCompleted());
  },
  paywallShown(placement: string, presentedAt: number) {
    safely((module) => module.paywallShown(placement, presentedAt));
  },
  paywallPlanSelected(plan: string) {
    safely((module) => module.paywallPlanSelected(plan));
  },
  paywallPurchased(plan: string) {
    safely((module) => module.paywallPurchased(plan));
  },
  paywallDismissed() {
    safely((module) => module.paywallDismissed());
  },
};
