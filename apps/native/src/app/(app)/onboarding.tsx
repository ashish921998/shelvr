import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { useOnboardingPaywall } from "@/lib/onboarding-paywall";
import { holdsOnlyLink } from "@/lib/use-incoming-share-url";
import type { SampleCityId } from "@/lib/sample-cities";
import { type EveningAfter, isSampleCity, samplePlan } from "@/lib/sample-trip";
import { isInterest, type Interest } from "@/lib/onboarding-interests";
import {
  GOAL_PLANS,
  GOAL_SPACES,
  goalFlow,
  goalShareSample,
  isPracticePost,
  type Goal,
} from "@/lib/onboarding-goals";
import { onboardingCompletedProperties } from "@/lib/onboarding-completed";
import { practiceShareSample } from "@/lib/onboarding-demo";
import { firstSharedUrl } from "@/lib/share/process-share";
import {
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  previousOnboardingStep,
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
  clearPendingShareOnDevice,
  markPendingShareOnDevice,
} from "@/lib/share/pending-share-store";
import { SignInView } from "@/components/sign-in-view";
import { CityStep, GoalStep } from "@/components/onboarding/goal";
import { InterestsStep } from "@/components/onboarding/interests";
import { OpenerStep } from "@/components/onboarding/opener";
import { PromiseStep } from "@/components/onboarding/promise";
import { SharePracticeStep } from "@/components/onboarding/share-practice";
import {
  TripBuildStep,
  TripRevealStep,
} from "@/components/onboarding/trip-teaser";
import { AppSymbolIcon } from "@/components/symbol";
import { useConvexAuth } from "convex/react";
import * as Haptics from "expo-haptics";
import { clearSharedPayloads, getSharedPayloads } from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PROGRESS: Record<OnboardingStep, number | null> = {
  opener: null,
  goal: 0.2,
  city: 0.4,
  interests: 0.4,
  share: 0.6,
  tripBuild: 0.8,
  tripReveal: 0.8,
  promise: 1,
};

const SHARE_TITLES = {
  travel: { inCity: "goal.shareTravel", anywhere: "sharePractice.title" },
  food: { inCity: "goal.shareFood", anywhere: "goal.shareFoodAnywhere" },
  date: { inCity: "goal.shareDate", anywhere: "goal.shareDateAnywhere" },
} as const;

/** `city` is null when the sample city only stands in for one we don't cover. */
function shareTitle(goal: Goal | null, city: string | null) {
  if (goal === null || goal === "other") return undefined;
  return city === null
    ? t(SHARE_TITLES[goal].anywhere)
    : t(SHARE_TITLES[goal].inCity, { city });
}

function holdIncomingShare() {
  try {
    if (getSharedPayloads().length > 0) markPendingShareOnDevice();
  } catch (err) {
    analytics.captureError("onboarding_hold_share_failed", err);
  }
}

/** Drops a held practice share by what was shared, since the goal, city or topics, and so the offered post, can change after it. */
function dropPracticeShare() {
  try {
    const payloads = getSharedPayloads();
    const url = firstSharedUrl(payloads);
    if (url === null || !isPracticePost(url)) return;
    if (!holdsOnlyLink(payloads, url)) return;
    clearSharedPayloads();
    clearPendingShareOnDevice();
  } catch (err) {
    analytics.captureError("onboarding_drop_share_failed", err);
  }
}

export default function OnboardingScreen() {
  useAppLocale();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { theme } = useUnistyles();
  const { completeOnboarding } = useOnboarding();
  const { isAuthenticated } = useConvexAuth();

  const [initialProgress] = useState(() => getOnboardingProgress());
  const [initialStep] = useState(() =>
    restoreOnboardingStep(initialProgress.step),
  );
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [spaces, setSpaces] = useState<string[]>(initialProgress.spaces);
  const [travelCity, setTravelCity] = useState<SampleCityId | null>(() =>
    isSampleCity(initialProgress.travelCity)
      ? initialProgress.travelCity
      : null,
  );
  const [goal, setGoal] = useState<Goal | null>(initialProgress.goal);
  const [eveningAfter, setEveningAfter] = useState<EveningAfter>("walk");
  const [showSignIn, setShowSignIn] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const trackedStepsRef = useRef(new Set<OnboardingStep>());
  const viewedStepsRef = useRef(new Set<OnboardingStep>());
  const [viewedOpenerPages] = useState(() => new Set<number>());
  const stepEnteredAt = useRef(0);
  const viewedStep = useRef<OnboardingStep | null>(null);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const interests = spaces.filter(isInterest);
  const flow = goalFlow(goal);
  const planKind = goal === null ? null : GOAL_PLANS[goal];
  const pickedCity = planKind === null ? null : travelCity;
  const trip = samplePlan(planKind ?? "trip", pickedCity);
  const cityName = t(trip.name);
  const cityStandIn =
    planKind !== null && planKind !== "trip" && pickedCity !== trip.city;

  useEffect(() => {
    setOnboardingProgress({
      spaces,
      travelCity,
      goal,
      step: stepIndex,
    });
  }, [spaces, travelCity, goal, stepIndex]);

  useEffect(() => {
    if (viewedStep.current === step) return;
    viewedStep.current = step;
    stepEnteredAt.current = Date.now();
    if (viewedStepsRef.current.has(step)) return;
    viewedStepsRef.current.add(step);
    analytics.capture("onboarding_step_viewed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: stepIndex,
      flow_version: ONBOARDING_FLOW_VERSION,
    });
  }, [step, stepIndex]);

  const recordCurrentStep = useCallback(() => {
    if (trackedStepsRef.current.has(step)) return;
    analytics.capture("onboarding_step_completed", {
      step_id: ONBOARDING_STEP_IDS[step],
      step_index: stepIndex,
      flow_version: ONBOARDING_FLOW_VERSION,
      duration_ms: Math.max(0, Date.now() - stepEnteredAt.current),
    });
    trackedStepsRef.current.add(step);
  }, [step, stepIndex]);

  const advance = useCallback(() => {
    recordCurrentStep();
    setStep((current) => flow[flow.indexOf(current) + 1] ?? current);
  }, [recordCurrentStep, flow]);

  const pickGoal = (picked: Goal) => {
    recordCurrentStep();
    if (picked !== goal) {
      setGoal(picked);
      setSpaces([...GOAL_SPACES[picked]]);
      setTravelCity(null);
    }
    const next = goalFlow(picked);
    setStep(next[next.indexOf("goal") + 1]);
  };

  const pickCity = (city: SampleCityId | null) => {
    setTravelCity(city);
    advance();
  };

  useEffect(() => {
    if (!signedIn || !isAuthenticated) return;
    holdIncomingShare();
    clearPending();
    completeOnboarding();
  }, [signedIn, isAuthenticated, completeOnboarding]);

  const toggleInterest = (interest: Interest) =>
    setSpaces((current) =>
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest],
    );

  const finish = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    analytics.capture(
      "onboarding_completed",
      onboardingCompletedProperties(spaces, pickedCity, goal),
    );
    recordCurrentStep();
    holdIncomingShare();
    setPendingSpaces(spaces.map(resolveOnboardingSpaceName));
    completeOnboarding();
  };

  const practiceSample =
    goal === null || planKind === null
      ? practiceShareSample(interests, null)
      : goalShareSample(goal, pickedCity);
  const paywall = useOnboardingPaywall({
    onPro: finish,
    onDecline: () => {
      dropPracticeShare();
      finish();
    },
    onUnavailable: finish,
  });

  if (showSignIn) {
    return (
      <SignInView
        onBack={() => setShowSignIn(false)}
        onCompleted={() => setSignedIn(true)}
      />
    );
  }

  const progress = PROGRESS[step];
  const previous = previousOnboardingStep(step, flow);
  const goBack =
    paywall.asked || previous === null ? null : () => setStep(previous);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {goBack ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={12}
            style={styles.back}
          >
            <AppSymbolIcon
              name="chevron.left"
              size={20}
              tintColor={theme.colors.foreground}
            />
          </Pressable>
        ) : null}
        <View style={[styles.barWrap, progress === null && styles.barHidden]}>
          <View
            style={[
              styles.bar,
              { width: `${Math.round((progress ?? 0) * 100)}%` },
            ]}
          />
        </View>
      </View>

      {step === "opener" ? (
        <View
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom + theme.gap(1) },
          ]}
        >
          <OpenerStep
            // iOS: a live text-size change leaves native text measurements stale (react-native#57512); remounting re-measures.
            key={fontScale}
            onStart={advance}
            onSignIn={() => setShowSignIn(true)}
            viewedPages={viewedOpenerPages}
          />
        </View>
      ) : step === "goal" || step === "city" ? (
        <View
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom },
          ]}
        >
          {step === "goal" || goal === null || goal === "other" ? (
            <GoalStep goal={goal} onPick={pickGoal} />
          ) : (
            <CityStep goal={goal} city={travelCity} onPick={pickCity} />
          )}
        </View>
      ) : step === "interests" || step === "tripReveal" ? (
        <View
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom + theme.gap(3) },
          ]}
        >
          {step === "interests" ? (
            <InterestsStep
              picked={interests}
              onToggle={toggleInterest}
              onAdvance={advance}
            />
          ) : (
            <TripRevealStep
              trip={trip}
              standIn={cityStandIn}
              after={eveningAfter}
              onAfter={setEveningAfter}
              onContinue={advance}
            />
          )}
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
          {step === "share" && (
            <SharePracticeStep
              title={shareTitle(goal, cityStandIn ? null : cityName)}
              sample={practiceSample}
              leaving={paywall.asked}
              onFinish={advance}
            />
          )}

          {step === "promise" && (
            <PromiseStep
              goal={goal ?? "other"}
              city={pickedCity === trip.city ? cityName : null}
              after={eveningAfter}
              leaving={paywall.asked}
              onCommit={() => {
                recordCurrentStep();
                paywall.ask();
              }}
            />
          )}

          {step === "tripBuild" && (
            <TripBuildStep trip={trip} onDone={advance} />
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
  header: {
    height: 28,
    marginTop: -12,
    marginBottom: -13,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  back: {
    padding: theme.gap(0.5),
  },
  barWrap: {
    flex: 1,
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
