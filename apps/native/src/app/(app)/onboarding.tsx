import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { ahaSample } from "@/lib/aha-sample";
import { stepTransition } from "@/lib/motion";
import { useOnboarding } from "@/lib/onboarding";
import { noteOnboardingFinished } from "@/lib/welcome-save";
import { notificationPermissionState } from "@/lib/notification-token";
import { useOnboardingPaywall } from "@/lib/onboarding-paywall";
import type { SampleCityId } from "@/lib/sample-cities";
import {
  GOALS,
  goalSpaces,
  planKindFor,
  type Goal,
  type Planner,
  type SavedCount,
} from "@/lib/onboarding-goals";
import { onboardingCompletedProperties } from "@/lib/onboarding-completed";
import {
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  nextOnboardingStep,
  onboardingProgress,
  previousOnboardingStep,
  restoreOnboardingStep,
  type OnboardingStep,
} from "@/lib/onboarding-steps";
import {
  clearPending,
  getOnboardingProgress,
  queueDemoUrl,
  resolveOnboardingSpaceName,
  setOnboardingProgress,
  setPendingSpaces,
} from "@/lib/pending-onboarding";
import { holdIncomingShare } from "@/lib/onboarding-exit";
import { SignInView } from "@/components/sign-in-view";
import { AhaShareStep } from "@/components/onboarding/aha-share";
import { AhaSpotsStep } from "@/components/onboarding/aha-spots";
import { CityStep } from "@/components/onboarding/city-step";
import { CommitmentStep } from "@/components/onboarding/commitment";
import { NotificationsStep } from "@/components/onboarding/notifications";
import { OpenerStep } from "@/components/onboarding/opener";
import { ProgressChartStep } from "@/components/onboarding/progress-chart";
import { ScalePressable } from "@/components/onboarding/parts";
import {
  GoalStep,
  PlannerStep,
  SavedCountStep,
} from "@/components/onboarding/questions";
import { AppSymbolIcon } from "@/components/symbol";
import { useConvexAuth } from "convex/react";
import { haptics } from "@/lib/haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The question screens a person may skip; skipping the goal plans for all of them, and the city uses the sample's own. */
const SKIPPABLE: ReadonlySet<OnboardingStep> = new Set([
  "savedCount",
  "goal",
  "planner",
  "city",
]);

function useStepAnalytics(step: OnboardingStep) {
  const tracked = useRef(new Set<OnboardingStep>());
  const viewed = useRef(new Set<OnboardingStep>());
  const enteredAt = useRef(0);
  const current = useRef<OnboardingStep | null>(null);
  const index = ONBOARDING_STEPS.indexOf(step);

  useEffect(() => {
    if (current.current === step) return;
    current.current = step;
    enteredAt.current = Date.now();
    if (viewed.current.has(step)) return;
    viewed.current.add(step);
    analytics.capture("onboarding_step_viewed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: index,
      flow_version: ONBOARDING_FLOW_VERSION,
    });
  }, [step, index]);

  return useCallback(() => {
    if (tracked.current.has(step)) return;
    analytics.capture("onboarding_step_completed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: index,
      flow_version: ONBOARDING_FLOW_VERSION,
      duration_ms: Math.max(0, Date.now() - enteredAt.current),
    });
    tracked.current.add(step);
  }, [step, index]);
}

function Header({
  step,
  onBack,
  onSkip,
}: {
  step: OnboardingStep;
  onBack: (() => void) | null;
  onSkip: (() => void) | null;
}) {
  const { theme } = useUnistyles();
  const progress = onboardingProgress(step);
  if (progress === null) return null;
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {onBack ? (
          <ScalePressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={theme.gap(1)}
            style={styles.back}
          >
            <AppSymbolIcon
              name="chevron.left"
              size={16}
              weight="semibold"
              tintColor={theme.colors.foreground}
            />
          </ScalePressable>
        ) : null}
      </View>
      <View style={styles.barWrap}>
        <View
          style={[styles.bar, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>
      <View style={[styles.side, styles.sideEnd]}>
        {onSkip ? (
          <ScalePressable
            onPress={onSkip}
            accessibilityRole="button"
            hitSlop={theme.gap(1)}
          >
            <Text style={styles.skip}>{t("onboardingQ.skip")}</Text>
          </ScalePressable>
        ) : null}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  useAppLocale();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const { completeOnboarding } = useOnboarding();
  const { isAuthenticated } = useConvexAuth();

  const [initial] = useState(() => getOnboardingProgress());
  const [step, setStep] = useState<OnboardingStep>(() =>
    restoreOnboardingStep(initial.step),
  );
  const [goals, setGoals] = useState<Goal[]>(initial.goals);
  const [savedCount, setSavedCount] = useState<SavedCount | null>(
    initial.savedCount,
  );
  const [planner, setPlanner] = useState<Planner | null>(initial.planner);
  const [travelCity, setTravelCity] = useState<SampleCityId | null>(
    initial.travelCity,
  );
  const [showSignIn, setShowSignIn] = useState(false);
  const [viewedOpenerPages] = useState(() => new Set<number>());
  const [signedIn, setSignedIn] = useState(false);
  const recordCurrentStep = useStepAnalytics(step);
  const kind = planKindFor(goals);
  const spaces = goalSpaces(goals);
  const sample = ahaSample(kind, travelCity);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  useEffect(() => {
    setOnboardingProgress({
      spaces: goalSpaces(goals),
      travelCity,
      goals,
      savedCount,
      planner,
      step: stepIndex,
    });
  }, [travelCity, goals, savedCount, planner, stepIndex]);

  const [backward, setBackward] = useState(false);
  const advance = useCallback(() => {
    recordCurrentStep();
    setBackward(false);
    setStep((current) =>
      current === step ? nextOnboardingStep(current) : current,
    );
  }, [recordCurrentStep, step]);

  useEffect(() => {
    if (!signedIn || !isAuthenticated) return;
    holdIncomingShare();
    clearPending();
    completeOnboarding();
  }, [signedIn, isAuthenticated, completeOnboarding]);

  const finish = () => {
    void haptics.success();
    analytics.capture(
      "onboarding_completed",
      onboardingCompletedProperties(spaces, {
        travelCity,
        goals,
        savedCount,
        planner,
      }),
    );
    recordCurrentStep();
    holdIncomingShare();
    setPendingSpaces(spaces.map(resolveOnboardingSpaceName));
    // The reel they shared in the demo becomes their first real save once they have Pro.
    queueDemoUrl(sample.firstSaveUrl);
    noteOnboardingFinished();
    completeOnboarding();
  };

  const paywall = useOnboardingPaywall({
    onPro: finish,
    onUnavailable: finish,
  });

  const askForPlan = () => {
    recordCurrentStep();
    paywall.ask();
  };

  const leaveCommitment = () => {
    void notificationPermissionState()
      .catch((error: unknown) => {
        analytics.captureError("onboarding_notifications_failed", error);
        return "blocked" as const;
      })
      .then((state) => (state === "ask" ? advance() : askForPlan()));
  };

  if (showSignIn) {
    return (
      <SignInView
        onBack={() => setShowSignIn(false)}
        onCompleted={() => setSignedIn(true)}
      />
    );
  }

  const previous = previousOnboardingStep(step);
  const skip = () => {
    if (step === "goal") setGoals([...GOALS]);
    if (step === "city") setTravelCity(null);
    advance();
  };

  const body = (() => {
    switch (step) {
      case "opener":
        return (
          <OpenerStep
            onStart={advance}
            onSignIn={() => setShowSignIn(true)}
            viewedPages={viewedOpenerPages}
          />
        );
      case "savedCount":
        return (
          <SavedCountStep
            picked={savedCount}
            onPick={setSavedCount}
            onContinue={advance}
          />
        );
      case "goal":
        return (
          <GoalStep picked={goals} onChange={setGoals} onContinue={advance} />
        );
      case "planner":
        return (
          <PlannerStep
            picked={planner}
            onPick={setPlanner}
            onContinue={advance}
          />
        );
      case "chart":
        return <ProgressChartStep kind={kind} onContinue={advance} />;
      case "city":
        return (
          <CityStep
            kind={kind}
            city={travelCity}
            onPick={(city) => {
              setTravelCity(city);
              advance();
            }}
          />
        );
      case "ahaShare":
        return <AhaShareStep sample={sample} onShared={advance} />;
      case "ahaSpots":
        return <AhaSpotsStep sample={sample} onContinue={advance} />;
      case "commitment":
        return (
          <CommitmentStep
            sample={sample}
            leaving={paywall.asked}
            onContinue={leaveCommitment}
          />
        );
      case "notifications":
        return (
          <NotificationsStep
            sample={sample}
            leaving={paywall.asked}
            onContinue={askForPlan}
          />
        );
    }
  })();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + theme.gap(1) },
      ]}
    >
      <Header
        step={step}
        onBack={
          paywall.asked || previous === null
            ? null
            : () => {
                setBackward(true);
                setStep(previous);
              }
        }
        onSkip={SKIPPABLE.has(step) ? skip : null}
      />
      <View style={styles.content}>
        {/* Keyed by step, so a new step springs in while the old one leaves; neither blocks a tap. */}
        <Animated.View
          key={step}
          {...stepTransition(reduced, backward)}
          style={styles.step}
        >
          {body}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.gap(3),
  },
  header: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  side: {
    minWidth: theme.control.minHeight,
  },
  sideEnd: {
    alignItems: "flex-end",
  },
  back: {
    width: theme.gap(4.5),
    height: theme.gap(4.5),
    borderRadius: theme.gap(2.25),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  barWrap: {
    flex: 1,
    height: 4,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 2,
    overflow: "hidden",
  },
  bar: {
    height: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  skip: {
    ...theme.type.subheadLabel,
    color: theme.colors.muted,
  },
  content: {
    flex: 1,
    marginHorizontal: -theme.gap(3),
    overflow: "hidden",
  },
  step: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: theme.gap(2),
    paddingHorizontal: theme.gap(3),
  },
}));
