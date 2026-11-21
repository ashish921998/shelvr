import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics, type AnalyticsEventProperties } from "@/lib/analytics";
import { GOALS } from "@/lib/onboarding-goals";
import {
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STEP_IDS,
  ONBOARDING_STEPS,
  nextOnboardingStep,
  previousOnboardingStep,
  restoreOnboardingStep,
  viewedBeforeResume,
  type OnboardingStep,
} from "@/lib/onboarding-steps";
import {
  dropLegacyProgress,
  handoffAnswers,
  parseOnboardingAnswers,
  readLegacyProgress,
  type OnboardingAnswers,
} from "@/lib/onboarding-handoff";

const PROGRESS_KEY = "shelvr.onboarding.progress";
const PROGRESS_FORMAT = 1;

type ProgressLock = { kind: "checking"; skipped: boolean } | { kind: "prompt" };

export type OnboardingProgressState = {
  step: OnboardingStep;
  answers: OnboardingAnswers;
  viewed: readonly OnboardingStep[];
  completed: readonly OnboardingStep[];
  visit: number;
  enteredAt: number;
  lock: ProgressLock | null;
  backward: boolean;
  finished: boolean;
};

type SavedProgress = Pick<
  OnboardingProgressState,
  "step" | "answers" | "viewed" | "completed"
>;

export type ProgressEvent =
  | { type: "answer"; answers: Partial<OnboardingAnswers> }
  | {
      type: "continue";
      from: OnboardingStep;
      answers?: Partial<OnboardingAnswers>;
    }
  | { type: "skip"; from: OnboardingStep }
  | { type: "back"; from: OnboardingStep }
  | { type: "permission"; visit: number; canAsk: boolean }
  | { type: "prompting"; asking: boolean }
  | { type: "finish" };

export type ProgressCommand =
  | { kind: "checkPermission"; visit: number }
  | { kind: "askPaywall" };

type ProgressAnalyticsEvent =
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_notifications";

type ProgressAnalytics = {
  [Event in ProgressAnalyticsEvent]: {
    event: Event;
    properties: AnalyticsEventProperties[Event];
  };
}[ProgressAnalyticsEvent];

export type ProgressTransition = {
  state: OnboardingProgressState;
  analytics: ProgressAnalytics[];
  command: ProgressCommand | null;
};

type Move = "next" | "checkPermission" | "askPaywall" | { to: OnboardingStep };

type StepRule = {
  continue: Move;
  skip: {
    move: Move;
    answers?: Partial<OnboardingAnswers>;
    declinesNotifications?: true;
  } | null;
  back?: (answers: OnboardingAnswers) => OnboardingStep;
};

const FORWARD: StepRule = { continue: "next", skip: { move: "next" } };

const STEP_RULES: Record<OnboardingStep, StepRule> = {
  opener: { continue: "next", skip: null },
  savedCount: FORWARD,
  goal: {
    continue: "next",
    skip: { move: "next", answers: { goals: [...GOALS] } },
  },
  been: {
    continue: "next",
    skip: { move: "next", answers: { beenCities: [] } },
  },
  chart: FORWARD,
  city: {
    continue: "next",
    skip: { move: "next", answers: { travelCity: null } },
  },
  cityEcho: FORWARD,
  ahaShare: {
    continue: "next",
    skip: { move: { to: "ahaSpots" }, answers: { skippedShare: true } },
  },
  firstSave: FORWARD,
  ahaSpots: {
    ...FORWARD,
    back: (answers) => (answers.skippedShare ? "ahaShare" : "firstSave"),
  },
  carousel: { continue: "checkPermission", skip: { move: "checkPermission" } },
  notifications: {
    continue: "askPaywall",
    skip: { move: "askPaywall", declinesNotifications: true },
  },
};

const NO_ANSWERS: OnboardingAnswers = {
  goals: [],
  savedCount: null,
  travelCity: null,
  beenCities: [],
  skippedShare: false,
};

const PROMPT: ProgressLock = { kind: "prompt" };

function stepProperties(step: OnboardingStep) {
  return {
    step_id: ONBOARDING_STEP_IDS[step],
    step_index: ONBOARDING_STEPS.indexOf(step),
    flow_version: ONBOARDING_FLOW_VERSION,
  };
}

function enter(
  draft: ProgressTransition,
  step: OnboardingStep,
  now: number,
  backward: boolean,
): ProgressTransition {
  const seen = draft.state.viewed.includes(step);
  return {
    ...draft,
    state: {
      ...draft.state,
      step,
      viewed: seen ? draft.state.viewed : [...draft.state.viewed, step],
      visit: draft.state.visit + 1,
      enteredAt: now,
      lock: null,
      backward,
    },
    analytics: seen
      ? draft.analytics
      : [
          ...draft.analytics,
          { event: "onboarding_step_viewed", properties: stepProperties(step) },
        ],
  };
}

function complete(
  draft: ProgressTransition,
  skipped: boolean,
  now: number,
): ProgressTransition {
  const { step, completed, enteredAt } = draft.state;
  if (completed.includes(step)) return draft;
  return {
    ...draft,
    state: { ...draft.state, completed: [...completed, step] },
    analytics: [
      ...draft.analytics,
      {
        event: "onboarding_step_completed",
        properties: {
          ...stepProperties(step),
          duration_ms: Math.max(0, now - enteredAt),
          skipped,
        },
      },
    ],
  };
}

function go(
  draft: ProgressTransition,
  move: Move,
  skipped: boolean,
  now: number,
): ProgressTransition {
  const { state } = draft;
  if (move === "checkPermission") {
    if (state.lock?.kind === "checking") return draft;
    return {
      ...draft,
      state: { ...state, lock: { kind: "checking", skipped } },
      command: { kind: "checkPermission", visit: state.visit },
    };
  }
  const completed = complete(draft, skipped, now);
  if (move === "askPaywall") {
    return { ...completed, command: { kind: "askPaywall" } };
  }
  const target = move === "next" ? nextOnboardingStep(state.step) : move.to;
  return enter(completed, target, now, false);
}

function withAnswers(
  draft: ProgressTransition,
  answers: Partial<OnboardingAnswers> | undefined,
): ProgressTransition {
  if (answers === undefined) return draft;
  return {
    ...draft,
    state: {
      ...draft.state,
      answers: { ...draft.state.answers, ...answers },
    },
  };
}

function previousStep(state: OnboardingProgressState): OnboardingStep | null {
  const back = STEP_RULES[state.step].back;
  return back ? back(state.answers) : previousOnboardingStep(state.step);
}

function skip(draft: ProgressTransition, now: number): ProgressTransition {
  const rule = STEP_RULES[draft.state.step].skip;
  if (rule === null) return draft;
  const declined: ProgressTransition = rule.declinesNotifications
    ? {
        ...draft,
        analytics: [
          ...draft.analytics,
          {
            event: "onboarding_notifications",
            properties: { action: "skip", granted: false },
          },
        ],
      }
    : draft;
  return go(withAnswers(declined, rule.answers), rule.move, true, now);
}

function answerPermission(
  draft: ProgressTransition,
  visit: number,
  canAsk: boolean,
  now: number,
): ProgressTransition {
  const { state } = draft;
  const lock = state.lock;
  if (
    visit !== state.visit ||
    state.step !== "carousel" ||
    lock?.kind !== "checking"
  ) {
    return draft;
  }
  const unlocked = { ...draft, state: { ...state, lock: null } };
  return go(unlocked, canAsk ? "next" : "askPaywall", lock.skipped, now);
}

function prompting(
  draft: ProgressTransition,
  asking: boolean,
): ProgressTransition {
  const current = draft.state.lock;
  const lock = asking ? PROMPT : current?.kind === "prompt" ? null : current;
  return lock === current
    ? draft
    : { ...draft, state: { ...draft.state, lock } };
}

export function transitionProgress(
  state: OnboardingProgressState,
  event: ProgressEvent,
  now: number,
): ProgressTransition {
  const draft: ProgressTransition = { state, analytics: [], command: null };
  if (state.finished) return draft;
  if ("from" in event && event.from !== state.step) return draft;
  switch (event.type) {
    case "answer":
      return withAnswers(draft, event.answers);
    case "continue":
      return go(
        withAnswers(draft, event.answers),
        STEP_RULES[state.step].continue,
        false,
        now,
      );
    case "skip":
      return skip(draft, now);
    case "back": {
      const target = previousStep(state);
      return target === null ? draft : enter(draft, target, now, true);
    }
    case "permission":
      return answerPermission(draft, event.visit, event.canAsk, now);
    case "prompting":
      return prompting(draft, event.asking);
    case "finish": {
      const done = complete(draft, false, now);
      return { ...done, state: { ...done.state, finished: true } };
    }
  }
}

export function beginProgress(
  saved: SavedProgress | null,
  now: number,
): ProgressTransition {
  const state: OnboardingProgressState = {
    step: "opener",
    answers: NO_ANSWERS,
    viewed: [],
    completed: [],
    ...saved,
    visit: 0,
    enteredAt: now,
    lock: null,
    backward: false,
    finished: false,
  };
  return enter({ state, analytics: [], command: null }, state.step, now, false);
}

export function canGoBack(
  state: OnboardingProgressState,
  paywallAsked: boolean,
): boolean {
  return !paywallAsked && previousStep(state) !== null;
}

export function canSkip(
  state: OnboardingProgressState,
  paywallAsked: boolean,
): boolean {
  return (
    !paywallAsked &&
    state.lock?.kind !== "prompt" &&
    STEP_RULES[state.step].skip !== null
  );
}

export function isLeaving(
  state: OnboardingProgressState,
  paywallAsked: boolean,
): boolean {
  return paywallAsked || state.lock?.kind === "checking";
}

function isStep(value: unknown): value is OnboardingStep {
  return ONBOARDING_STEPS.some((step) => step === value);
}

function stepsIn(value: unknown): OnboardingStep[] {
  return Array.isArray(value)
    ? ONBOARDING_STEPS.filter((step) => value.includes(step))
    : [];
}

function readProgress(): SavedProgress | null {
  const raw = SecureStore.getItem(PROGRESS_KEY);
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.format !== PROGRESS_FORMAT || !isStep(record.step)) return null;
    return {
      step: record.step,
      answers: parseOnboardingAnswers(record),
      viewed: stepsIn(record.viewed),
      completed: stepsIn(record.completed),
    };
  } catch {
    return null;
  }
}

function writeProgress(saved: SavedProgress) {
  SecureStore.setItem(
    PROGRESS_KEY,
    JSON.stringify({
      format: PROGRESS_FORMAT,
      step: saved.step,
      ...saved.answers,
      viewed: saved.viewed,
      completed: saved.completed,
    }),
  );
}

let progressEnds = 0;

function saveProgress(saved: SavedProgress) {
  try {
    writeProgress(saved);
  } catch (error) {
    analytics.captureError("onboarding_progress_save_failed", error);
  }
}

export function clearOnboardingProgress() {
  progressEnds += 1;
  try {
    SecureStore.setItem(PROGRESS_KEY, "");
  } catch (error) {
    analytics.captureError("onboarding_progress_clear_failed", error);
  }
}

function importLegacyProgress(): SavedProgress | null {
  const legacy = readLegacyProgress();
  if (legacy === null) return null;
  const { step, viewed, ...answers } = legacy;
  const resumed = restoreOnboardingStep(step);
  const passed = viewedBeforeResume(step).filter(
    (seen) => !(answers.skippedShare && seen === "firstSave"),
  );
  const saved: SavedProgress = {
    step: resumed,
    answers,
    viewed: stepsIn([...passed, ...viewed]),
    completed: passed.filter((seen) => seen !== resumed),
  };
  try {
    writeProgress(saved);
  } catch (error) {
    analytics.captureError("onboarding_progress_save_failed", error);
    return saved;
  }
  dropLegacyProgress();
  return saved;
}

export function loadOnboardingProgress(): SavedProgress | null {
  return readProgress() ?? importLegacyProgress();
}

export function onboardingAnswers(): OnboardingAnswers {
  return readProgress()?.answers ?? handoffAnswers();
}

export function useOnboardingProgress() {
  const [start] = useState(() =>
    beginProgress(loadOnboardingProgress(), Date.now()),
  );
  const [state, setState] = useState(start.state);
  const current = useRef(start.state);
  const started = useRef(false);
  const [era] = useState(() => progressEnds);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    saveProgress(start.state);
    for (const entry of start.analytics) {
      analytics.capture(entry.event, entry.properties);
    }
  }, [start]);

  const dispatch = useCallback(
    (event: ProgressEvent) => {
      if (era !== progressEnds) return null;
      const result = transitionProgress(current.current, event, Date.now());
      if (result.state !== current.current) {
        if (!result.state.finished) saveProgress(result.state);
        current.current = result.state;
        setState(result.state);
      }
      for (const entry of result.analytics) {
        analytics.capture(entry.event, entry.properties);
      }
      return result.command;
    },
    [era],
  );

  const read = useCallback(() => current.current, []);

  return { state, dispatch, read };
}
