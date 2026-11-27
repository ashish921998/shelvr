import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { bestEffort } from "@/lib/best-effort";
import { ahaSample } from "@/lib/aha-sample";
import { stepTransition } from "@/lib/motion";
import { useOnboarding } from "@/lib/onboarding";
import { noteOnboardingFinished } from "@/lib/welcome-save";
import { notificationPermissionState } from "@/lib/notification-token";
import { useOnboardingPaywall } from "@/lib/onboarding-paywall";
import { useFreePlanOpen } from "@/lib/free-plan";
import {
  cityQuestion,
  goalSpaces,
  planKindFor,
  type Goal,
  type SavedCount,
} from "@/lib/onboarding-goals";
import { cityEchoText } from "@/lib/onboarding-echo";
import { onboardingCompletedProperties } from "@/lib/onboarding-completed";
import { type SampleCityId } from "@/lib/sample-cities";
import {
  onboardingProgressFraction,
  type OnboardingStep,
} from "@/lib/onboarding-steps";
import {
  canGoBack,
  canSkip,
  clearOnboardingProgress,
  isLeaving,
  useOnboardingProgress,
  type ProgressCommand,
  type ProgressEvent,
} from "@/lib/onboarding-progress";
import { clearHandoff, finishHandoff } from "@/lib/onboarding-handoff";
import { queueCityStamps } from "@/lib/pending-city-stamps";
import { holdIncomingShare } from "@/lib/onboarding-exit";
import { SignInView } from "@/components/sign-in-view";
import { AhaShareStep } from "@/components/onboarding/aha-share";
import { AhaSpotsStep } from "@/components/onboarding/aha-spots";
import { BeenStep } from "@/components/onboarding/been-step";
import { CityStep } from "@/components/onboarding/city-step";
import { CarouselStep } from "@/components/onboarding/carousel";
import { FirstSaveStep } from "@/components/onboarding/first-save";
import { NotificationsStep } from "@/components/onboarding/notifications";
import { OpenerStep } from "@/components/onboarding/opener";
import { ScalePressable } from "@/components/onboarding/parts";
import { StatementStep } from "@/components/onboarding/statement";
import { ProgressChartStep } from "@/components/onboarding/progress-chart";
import { GoalStep, SavedCountStep } from "@/components/onboarding/questions";
import { AppSymbolIcon } from "@/components/symbol";
import { useConvexAuth } from "convex/react";
import { haptics } from "@/lib/haptics";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
  const progress = onboardingProgressFraction(step);
  if (progress === null) return null;
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {onBack ? (
          <ScalePressable
            onPress={() => {
              void haptics.impact();
              onBack();
            }}
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

  const [showSignIn, setShowSignIn] = useState(false);
  const [viewedOpenerPages] = useState(() => new Set<number>());
  const [signedIn, setSignedIn] = useState(false);

  const progress = useOnboardingProgress();
  const { state, read } = progress;
  const { step, answers } = state;
  const { goals, savedCount, travelCity } = answers;
  const kind = planKindFor(goals);
  const sample = ahaSample(kind, travelCity);
  const record = progress.dispatch;

  const onAsking = useCallback(
    (asking: boolean) => {
      record({ type: "prompting", asking });
    },
    [record],
  );

  useEffect(() => {
    if (!signedIn || !isAuthenticated) return;
    holdIncomingShare();
    clearHandoff();
    clearOnboardingProgress();
    bestEffort("onboarding_sign_in_finish_failed", completeOnboarding);
  }, [signedIn, isAuthenticated, completeOnboarding]);

  const finish = () => {
    const finished = read().answers;
    const spaces = goalSpaces(finished.goals);
    void haptics.success();
    analytics.capture(
      "onboarding_completed",
      onboardingCompletedProperties(spaces, finished),
    );
    record({ type: "finish" });
    holdIncomingShare();
    finishHandoff(
      finished,
      finished.skippedShare
        ? null
        : ahaSample(planKindFor(finished.goals), finished.travelCity)
            .firstSaveUrl,
    );
    queueCityStamps(finished.beenCities);
    noteOnboardingFinished();
    clearOnboardingProgress();
    completeOnboarding();
  };

  const freePlanOpen = useFreePlanOpen();
  const paywall = useOnboardingPaywall({
    onPro: finish,
    onUnavailable: finish,
    onClosed: freePlanOpen === false ? undefined : finish,
  });

  function follow(command: ProgressCommand | null): void {
    if (command?.kind === "askPaywall") paywall.ask();
    if (command?.kind !== "checkPermission") return;
    void notificationPermissionState()
      .catch((error: unknown) => {
        analytics.captureError("onboarding_notifications_check_failed", error);
        return "blocked" as const;
      })
      .then((permission) =>
        follow(
          record({
            type: "permission",
            visit: command.visit,
            canAsk: permission === "ask",
          }),
        ),
      );
  }
  const dispatch = (event: ProgressEvent) => follow(record(event));
  const advance = () => dispatch({ type: "continue", from: step });
  const answer = (changes: Partial<typeof answers>) =>
    dispatch({ type: "answer", answers: changes });

  if (showSignIn) {
    return (
      <SignInView
        onBack={() => setShowSignIn(false)}
        onCompleted={() => setSignedIn(true)}
      />
    );
  }

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
            onPick={(count: SavedCount) => answer({ savedCount: count })}
            onContinue={advance}
          />
        );
      case "been":
        return (
          <BeenStep
            picked={answers.beenCities}
            onChange={(picked: SampleCityId[]) =>
              answer({ beenCities: picked })
            }
            onContinue={advance}
          />
        );
      case "chart":
        return <ProgressChartStep kind={kind} onContinue={advance} />;
      case "goal":
        return (
          <GoalStep
            picked={goals}
            onChange={(picked: Goal[]) => answer({ goals: picked })}
            onContinue={advance}
          />
        );
      case "city":
        return (
          <CityStep
            kind={kind}
            question={cityQuestion(goals)}
            city={travelCity}
            onPick={(city) =>
              dispatch({
                type: "continue",
                from: "city",
                answers: { travelCity: city },
              })
            }
          />
        );
      case "cityEcho":
        return (
          <StatementStep
            text={cityEchoText(travelCity, sample.city)}
            onContinue={advance}
          />
        );
      case "ahaShare":
        return (
          <AhaShareStep
            sample={sample}
            onShared={() =>
              dispatch({
                type: "continue",
                from: "ahaShare",
                answers: { skippedShare: false },
              })
            }
          />
        );
      case "firstSave":
        return <FirstSaveStep onContinue={advance} />;
      case "ahaSpots":
        return <AhaSpotsStep sample={sample} onContinue={advance} />;
      case "carousel":
        return (
          <CarouselStep
            sample={sample}
            leaving={isLeaving(state, paywall.asked)}
            onContinue={advance}
          />
        );
      case "notifications":
        return (
          <NotificationsStep
            sample={sample}
            leaving={isLeaving(state, paywall.asked)}
            onAsking={onAsking}
            onContinue={advance}
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
          canGoBack(state, paywall.asked)
            ? () => dispatch({ type: "back", from: step })
            : null
        }
        onSkip={
          canSkip(state, paywall.asked)
            ? () => dispatch({ type: "skip", from: step })
            : null
        }
      />
      <View style={styles.content}>
        {/* Keyed by step, so a new step springs in while the old one leaves; neither blocks a tap. */}
        <Animated.View
          key={step}
          {...stepTransition(reduced, state.backward)}
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
