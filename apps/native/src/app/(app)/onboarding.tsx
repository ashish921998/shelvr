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
import Animated, {
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { motion, REDUCED_FADE_IN, REDUCED_FADE_OUT } from "@/lib/motion";

const PROGRESS: Record<OnboardingStep, number | null> = {
  opener: null,
  setup: 0.25,
  demo: 0.5,
  reveal: 1,
};
const READING_PROGRESS = 0.625;

// Step-to-step transitions: a short rise in, a shorter drift out. The
// Reanimated drivers fire on mount/unmount, so a step change only animates if
// React remounts the wrapper — each step passes its own `key`.
const STEP_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 12 }] },
  100: {
    opacity: 1,
    transform: [{ translateY: 0 }],
    easing: motion.easing.out,
  },
}).duration(motion.duration.enter);

const STEP_EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: {
    opacity: 0,
    transform: [{ translateY: -6 }],
    easing: motion.easing.out,
  },
}).duration(motion.duration.exit);

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

  const reducedMotion = useReducedMotion();
  const progress =
    step === "demo" && reading ? READING_PROGRESS : PROGRESS[step];
  // The bar animates between step widths; onLayout supplies the pixel track
  // width so the UI thread never animates a percentage string.
  const [barWidth, setBarWidth] = useState(0);
  const barStyle = useAnimatedStyle(() => ({
    width: withTiming(barWidth * (progress ?? 0), motion.timing.enter),
  }));

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View
        style={[styles.barWrap, progress === null && styles.barHidden]}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.bar, barStyle]} />
      </View>

      {step === "opener" ? (
        <Animated.View
          key="opener"
          entering={reducedMotion ? REDUCED_FADE_IN : STEP_ENTER}
          exiting={reducedMotion ? REDUCED_FADE_OUT : STEP_EXIT}
          collapsable={false}
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom + theme.gap(1) },
          ]}
        >
          <OpenerStep onStart={advance} onSignIn={() => setShowSignIn(true)} />
        </Animated.View>
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
            <Animated.View
              key="setup"
              entering={reducedMotion ? REDUCED_FADE_IN : STEP_ENTER}
              exiting={reducedMotion ? REDUCED_FADE_OUT : STEP_EXIT}
              collapsable={false}
            >
              <SetupStep
                kinds={kinds}
                spaces={spaces}
                onToggleKind={toggleKind}
                onToggleSpace={toggleSpace}
                onAddSpace={addSpace}
                onAdvance={advance}
              />
            </Animated.View>
          )}

          {step === "demo" && (
            <Animated.View
              key="demo"
              entering={reducedMotion ? REDUCED_FADE_IN : STEP_ENTER}
              exiting={reducedMotion ? REDUCED_FADE_OUT : STEP_EXIT}
              collapsable={false}
            >
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
            </Animated.View>
          )}

          {step === "reveal" && (
            <Animated.View
              key="reveal"
              entering={reducedMotion ? REDUCED_FADE_IN : STEP_ENTER}
              exiting={reducedMotion ? REDUCED_FADE_OUT : STEP_EXIT}
              collapsable={false}
            >
              <RevealStep
                saved={saved}
                restored={initialStep === "reveal"}
                onSaved={setSaved}
                onFinish={finish}
              />
            </Animated.View>
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
