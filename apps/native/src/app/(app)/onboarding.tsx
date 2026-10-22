import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { useOnboardingPaywall } from "@/lib/onboarding-paywall";
import { holdsOnlyLink } from "@/lib/use-incoming-share-url";
import type { SampleCityId } from "@/lib/sample-cities";
import { isSampleCity, sampleTrip, showTripTeaser } from "@/lib/sample-trip";
import { isInterest, type Interest } from "@/lib/onboarding-interests";
import { onboardingCompletedProperties } from "@/lib/onboarding-completed";
import {
  isTravelVibe,
  spacesAfterInterestToggle,
  TRAVEL_INTEREST,
} from "@/lib/travel-vibes";
import { practiceShareSample } from "@/lib/onboarding-demo";
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
import { InterestsStep } from "@/components/onboarding/interests";
import { OpenerStep } from "@/components/onboarding/opener";
import { PromiseStep } from "@/components/onboarding/promise";
import { SharePracticeStep } from "@/components/onboarding/share-practice";
import {
  TripBuildStep,
  TripLockedStep,
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
  interests: 0.35,
  share: 0.7,
  promise: 1,
  tripBuild: 1,
  tripLocked: 1,
  tripReveal: 1,
};

function holdIncomingShare() {
  try {
    if (getSharedPayloads().length > 0) markPendingShareOnDevice();
  } catch (err) {
    analytics.captureError("onboarding_hold_share_failed", err);
  }
}

function dropPracticeShare(practiceUrl: string | undefined) {
  try {
    if (practiceUrl === undefined) return;
    if (!holdsOnlyLink(getSharedPayloads(), practiceUrl)) return;
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
  const [showSignIn, setShowSignIn] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const trackedStepsRef = useRef(new Set<OnboardingStep>());
  const viewedStepsRef = useRef(new Set<OnboardingStep>());
  const [viewedOpenerPages] = useState(() => new Set<number>());
  const stepEnteredAt = useRef(0);
  const viewedStep = useRef<OnboardingStep | null>(null);
  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const interests = spaces.filter(isInterest);
  const vibes = spaces.filter(isTravelVibe);
  const teaser = showTripTeaser(interests);
  const pickedCity = interests.includes(TRAVEL_INTEREST) ? travelCity : null;
  const trip = sampleTrip(pickedCity);

  useEffect(() => {
    setOnboardingProgress({
      spaces,
      travelCity,
      step: stepIndex,
    });
  }, [spaces, travelCity, stepIndex]);

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
    setStep(
      (current) =>
        ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(current) + 1] ?? current,
    );
  }, [recordCurrentStep]);

  useEffect(() => {
    if (!signedIn || !isAuthenticated) return;
    holdIncomingShare();
    clearPending();
    completeOnboarding();
  }, [signedIn, isAuthenticated, completeOnboarding]);

  const toggleSpace = (name: string) =>
    setSpaces((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );

  const toggleInterest = (interest: Interest) => {
    if (interest === TRAVEL_INTEREST && interests.includes(interest)) {
      setTravelCity(null);
    }
    setSpaces((current) => spacesAfterInterestToggle(current, interest));
  };

  const finish = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    analytics.capture(
      "onboarding_completed",
      onboardingCompletedProperties(spaces, pickedCity),
    );
    recordCurrentStep();
    holdIncomingShare();
    setPendingSpaces(spaces.map(resolveOnboardingSpaceName));
    completeOnboarding();
  };

  const practiceSample = practiceShareSample(interests, pickedCity);
  const paywall = useOnboardingPaywall({
    onPro: teaser ? () => setStep("tripReveal") : finish,
    onDecline: () => {
      dropPracticeShare(practiceSample?.url);
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
  const previous = previousOnboardingStep(step);
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
      ) : step === "interests" ? (
        <View
          style={[
            styles.content,
            styles.scroll,
            { paddingBottom: insets.bottom + theme.gap(3) },
          ]}
        >
          <InterestsStep
            picked={interests}
            vibes={vibes}
            city={travelCity}
            onToggle={toggleInterest}
            onToggleVibe={toggleSpace}
            onPickCity={setTravelCity}
            onAdvance={advance}
          />
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
              sample={practiceSample}
              leaving={paywall.asked}
              onFinish={advance}
            />
          )}

          {step === "promise" && (
            <PromiseStep
              leaving={paywall.asked}
              onCommit={teaser ? advance : paywall.ask}
            />
          )}

          {step === "tripBuild" && (
            <TripBuildStep trip={trip} onDone={advance} />
          )}

          {step === "tripLocked" && (
            <TripLockedStep
              trip={trip}
              leaving={paywall.asked}
              onUnlock={() => {
                recordCurrentStep();
                paywall.ask();
              }}
            />
          )}

          {step === "tripReveal" && (
            <TripRevealStep trip={trip} onContinue={finish} />
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
