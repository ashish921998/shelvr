import { useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { orderDemoSamples, orderShareDemoSamples } from "@/lib/onboarding-demo";
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  restoreOnboardingStep,
  type OnboardingStep,
} from "@/lib/onboarding-steps";
import {
  clearPending,
  getOnboardingProgress,
  resolveOnboardingSpaceName,
  setOnboardingProgress,
  setPendingSpaces,
} from "@/lib/pending-onboarding";
import {
  isPresetSpace,
  isSaveKind,
  spacesAfterKindToggle,
  type SaveKind,
} from "@/lib/save-kinds";
import { markPendingShareOnDevice } from "@/lib/share/pending-share-store";
import { SignInView } from "@/components/sign-in-view";
import {
  LiveDemoStep,
  type DemoSaved,
} from "@/components/onboarding/live-demo";
import { OpenerStep } from "@/components/onboarding/opener";
import { RevealStep } from "@/components/onboarding/reveal";
import { SetupStep } from "@/components/onboarding/setup";
import { useConvexAuth } from "convex/react";
import * as Haptics from "expo-haptics";
import { getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PROGRESS: Record<OnboardingStep, number | null> = {
  opener: null,
  setup: 0.25,
  demo: 0.5,
  reveal: 1,
};
const READING_PROGRESS = 0.625;

// A share that arrived mid-onboarding and was not the demo save is still held
// by expo-sharing. Flagging it lets the share screen pick it up in the app.
function holdIncomingShare() {
  try {
    if (getSharedPayloads().length > 0) markPendingShareOnDevice();
  } catch (err) {
    analytics.captureError("onboarding_hold_share_failed", err);
  }
}

export default function OnboardingScreen() {
  useAppLocale();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { completeOnboarding } = useOnboarding();
  const { isAuthenticated } = useConvexAuth();

  const [initialProgress] = useState(() => getOnboardingProgress());
  const [initialStep] = useState(() =>
    restoreOnboardingStep(initialProgress.step),
  );
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [kinds, setKinds] = useState<SaveKind[]>(() =>
    initialProgress.saveKinds.filter(isSaveKind),
  );
  const [spaces, setSpaces] = useState<string[]>(initialProgress.spaces);
  const [saved, setSaved] = useState<DemoSaved | null>(null);
  const [reading, setReading] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const trackedStepsRef = useRef(new Set<OnboardingStep>());
  const stepEnteredAt = useRef(0);
  const viewedStep = useRef<OnboardingStep | null>(null);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  useEffect(() => {
    setOnboardingProgress({ saveKinds: kinds, spaces, step: stepIndex });
  }, [kinds, spaces, stepIndex]);

  useEffect(() => {
    if (viewedStep.current === step) return;
    viewedStep.current = step;
    stepEnteredAt.current = Date.now();
    analytics.capture("onboarding_step_viewed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: stepIndex,
    });
  }, [step, stepIndex]);

  const recordCurrentStep = useCallback(() => {
    if (trackedStepsRef.current.has(step)) return;
    analytics.capture("onboarding_step_completed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: stepIndex,
      duration_ms: Math.max(0, Date.now() - stepEnteredAt.current),
    });
    trackedStepsRef.current.add(step);
  }, [step, stepIndex]);

  const advance = useCallback(() => {
    recordCurrentStep();
    setStep(
      (current) =>
        ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(current) + 1] ?? current,
    );
  }, [recordCurrentStep]);

  // A returning account already has its spaces, so the setup answers are
  // dropped instead of replayed onto it.
  useEffect(() => {
    if (!signedIn || !isAuthenticated) return;
    holdIncomingShare();
    clearPending();
    completeOnboarding();
  }, [signedIn, isAuthenticated, completeOnboarding]);

  const toggleKind = (kind: SaveKind) => {
    setSpaces(spacesAfterKindToggle(kinds, spaces, kind));
    setKinds(
      kinds.includes(kind)
        ? kinds.filter((value) => value !== kind)
        : [...kinds, kind],
    );
  };

  const toggleSpace = (name: string) =>
    setSpaces((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );

  const addSpace = (name: string) =>
    setSpaces((current) =>
      current.includes(name) ? current : [...current, name],
    );

  const finish = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    analytics.capture("onboarding_completed", {
      save_pileup: [],
      save_types: kinds,
      space_count: spaces.length,
      space_names: spaces.filter(isPresetSpace),
      custom_space_count: spaces.filter((name) => !isPresetSpace(name)).length,
      $set: { save_pileup: [], save_types: kinds },
    });
    recordCurrentStep();
    holdIncomingShare();
    setPendingSpaces(spaces.map(resolveOnboardingSpaceName));
    completeOnboarding();
  };

  if (showSignIn) {
    return (
      <SignInView
        onBack={() => setShowSignIn(false)}
        onCompleted={() => setSignedIn(true)}
      />
    );
  }

  const progress =
    step === "demo" && reading ? READING_PROGRESS : PROGRESS[step];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.barWrap, progress === null && styles.barHidden]}>
        <View
          style={[
            styles.bar,
            { width: `${Math.round((progress ?? 0) * 100)}%` },
          ]}
        />
      </View>

      {step === "opener" ? (
        <View
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom + theme.gap(1) },
          ]}
        >
          <OpenerStep onStart={advance} onSignIn={() => setShowSignIn(true)} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.gap(3) },
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {step === "setup" && (
            <SetupStep
              kinds={kinds}
              spaces={spaces}
              onToggleKind={toggleKind}
              onToggleSpace={toggleSpace}
              onAddSpace={addSpace}
              onAdvance={advance}
            />
          )}

          {step === "demo" && (
            <LiveDemoStep
              samples={
                Platform.OS === "ios"
                  ? orderShareDemoSamples(kinds)
                  : orderDemoSamples(kinds)
              }
              spaces={spaces}
              resume={initialStep === "demo" ? initialProgress.demo : null}
              onSaved={setSaved}
              onReadingChange={setReading}
              onAdvance={advance}
            />
          )}

          {step === "reveal" && (
            <RevealStep
              saved={saved}
              restored={initialStep === "reveal"}
              onSaved={setSaved}
              onFinish={finish}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.gap(3),
  },
  barWrap: {
    height: 3,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 2,
    overflow: "hidden",
  },
  barHidden: {
    opacity: 0,
  },
  bar: {
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: theme.gap(3),
  },
}));
