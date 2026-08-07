import { BuildingStep } from '@/components/onboarding/building';
import { LiveDemoStep } from '@/components/onboarding/live-demo';
import { PermissionsStep } from '@/components/onboarding/permissions';
import { PromiseStep } from '@/components/onboarding/promise';
import { RateStep } from '@/components/onboarding/rate';
import { ReadyStep } from '@/components/onboarding/ready';
import { SpacePickerStep, type SaveKind, getSpacePresets } from '@/components/onboarding/space-picker';
import { SurveyStep } from '@/components/onboarding/survey';
import type { FeedItem } from '@/components/item-card';
import { useEntitlement } from '@/lib/entitlement';
import { useOnboarding } from '@/lib/onboarding';
import { setPendingSpaces } from '@/lib/pending-onboarding';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useConvexAuth } from 'convex/react';
import { StyleSheet } from 'react-native-unistyles';
import { usePostHog } from 'posthog-react-native';

// Onboarding v2 — a 9-step quiz-funnel flow (spec: docs/onboarding-v2-spec.html).
// This file is the step machine: a `step` index, lifted survey/space/demo state,
// a thin progress bar, and step transitions between the step components.
// Each step owns its own CTA copy and advance condition; the orchestrator
// hands them `advance`/`finish` and the shared state.
//
// Order: promise → survey Q1 → survey Q2 → space picker → building → live demo
// → permissions → rate → ready → (paywall). Sign-in stays first (the route is
// auth-gated); the paywall is the existing finish() verbatim.

// Step indices — named so the render switch reads as the funnel, not as numbers.
const STEPS = {
  promise: 0,
  surveyQ1: 1,
  surveyQ2: 2,
  spaces: 3,
  building: 4,
  demo: 5,
  permissions: 6,
  rate: 7,
  ready: 8,
} as const;

// Q1 — "Where do your saves pile up today?" Analytics-only; no persistence, and
// it doesn't seed anything downstream. Kept here (not in the component) because
// the copy is product-wide, not a presentation detail.
const Q1_OPTIONS = [
  'X bookmarks',
  'Instagram saved',
  'Screenshots',
  'Notes app',
  'Browser tabs',
  'Everywhere',
] as const;

// Q2 — "What do you save most?" Each answer is a SaveKind that seeds the space
// picker presets, so the options here must stay in lockstep with that map.
const Q2_OPTIONS: readonly SaveKind[] = [
  'Articles',
  'Recipes',
  'Products',
  'Home & decor',
  'Travel',
  'Fitness',
  'Inspiration',
  'Videos',
];

// The progress bar covers steps 2–8 (survey Q1 through rate). Promise (step 1)
// has no bar — it's the value screen, not the quiz — and ready shows a full bar.
const FIRST_PROGRESS_STEP = STEPS.surveyQ1; // 1
const LAST_PROGRESS_STEP = STEPS.rate; // 7

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();
  const { entitled } = useEntitlement();
  const { isAuthenticated } = useConvexAuth();

  const [step, setStep] = useState<number>(STEPS.promise);
  const [q1, setQ1] = useState<string[]>([]);
  const [q2, setQ2] = useState<SaveKind[]>([]);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [demoItem, setDemoItem] = useState<FeedItem | null>(null);
  const spacesInitRef = useRef(false);

  const advance = useCallback(
    () => setStep((s) => Math.min(s + 1, STEPS.ready)),
    [],
  );

  // Pre-select spaces from Q2 presets when the user first reaches the spaces
  // step. The ref guard ensures this runs only once, preserving subsequent
  // user deselections.
  useEffect(() => {
    if (step === STEPS.spaces && !spacesInitRef.current) {
      spacesInitRef.current = true;
      setSpaces(getSpacePresets(q2));
    }
  }, [step, q2]);

  // Survey toggle helper — multi-select, order-independent. Shared by both Qs
  // and the space picker. The setter accepts a subtype of string (SaveKind is a
  // string union), so the generic keeps the element type narrow per state.
  function toggle<T extends string>(setter: React.Dispatch<React.SetStateAction<T[]>>) {
    return (option: T) =>
      setter((prev) =>
        prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
      );
  }

  // Persist the replay payload before flipping the onboarding route flag. The
  // replay hook owns both the entitled and paywall paths, so there is one
  // durable completion flow instead of two competing paywall presentations.
  const finish = () => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    posthog.capture('onboarding_completed');
    setPendingSpaces(spaces);
    completeOnboarding();
    if (!isAuthenticated) {
      router.replace('/(auth)/sign-in');
    }
  };

  // Progress bar value for the current step. Steps outside the quiz window
  // (promise, ready) hide the bar entirely.
  const showBar =
    step >= FIRST_PROGRESS_STEP && step <= LAST_PROGRESS_STEP;
  const progress =
    (step - FIRST_PROGRESS_STEP) / (LAST_PROGRESS_STEP - FIRST_PROGRESS_STEP);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.barWrap, !showBar && styles.barHidden]}>
        <View
          style={[styles.bar, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === STEPS.promise && <PromiseStep onAdvance={advance} />}

          {step === STEPS.surveyQ1 && (
            <SurveyStep
              headline="Where do your saves pile up today?"
              support="Be honest — we've seen worse."
              options={Q1_OPTIONS}
              selected={q1}
              onToggle={toggle(setQ1)}
              ctaLabel="Continue"
              onAdvance={advance}
            />
          )}

          {step === STEPS.surveyQ2 && (
            <SurveyStep
              headline="What do you save most?"
              support="This shapes your shelf."
              options={Q2_OPTIONS}
              selected={q2}
              onToggle={toggle(setQ2)}
              ctaLabel="Continue"
              onAdvance={advance}
            />
          )}

          {step === STEPS.spaces && (
            <SpacePickerStep
              answers={q2}
              selected={spaces}
              onToggle={toggle(setSpaces)}
              onAdvance={advance}
            />
          )}

          {step === STEPS.building && <BuildingStep onDone={advance} />}

          {step === STEPS.demo && (
            <LiveDemoStep
              entitled={entitled}
              // The demo step reports the classified item up so the recap can
              // show it. If the user skips, demoItem stays null and ready shows
              // the spaces only.
              onReady={setDemoItem}
              onAdvance={advance}
            />
          )}

          {step === STEPS.permissions && <PermissionsStep onAdvance={advance} />}

          {step === STEPS.rate && <RateStep onAdvance={advance} />}

          {step === STEPS.ready && (
            <ReadyStep spaceNames={spaces} demoItem={demoItem} onFinish={finish} />
          )}
        </ScrollView>
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
  barWrap: {
    height: 3,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: theme.gap(2),
  },
  barHidden: {
    // Keep the layout slot so screens don't jump when the bar appears at Q1,
    // but make the track invisible on the promise screen.
    opacity: 0,
  },
  bar: {
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: theme.gap(3),
    gap: theme.gap(2),
  },
}));
