import { createMMKV } from 'react-native-mmkv';
import { analytics, type CancelSurveyReason } from '@/lib/analytics';
import { posthog } from '@/lib/posthog';

export type { CancelSurveyReason };

/**
 * Next-visit cancel survey.
 *
 * Shown once per account on the Home root when RevenueCat reports the user's
 * trial is cancelled but still inside its window (`willRenew === false`,
 * period `TRIAL` — see lib/trial-cancellation.ts). This is the only
 * stated-reason channel in v1; it deliberately fires on the next app visit
 * rather than at the cancel moment, because nothing in-app can intercept
 * Apple's cancel sheet.
 *
 * Privacy rules, mirroring lib/feedback.ts:
 * - Events carry bounded reason ids only — never free text, URLs, or content.
 * - A submitted reason is stated intent, not proof of cancellation. Only the
 *   server-side webhook events (`trial_cancelled`, …) count as cancellations.
 */

export const CANCEL_SURVEY_REASONS: readonly CancelSurveyReason[] = [
  'too_expensive',
  'not_useful_enough',
  'missing_feature',
  'other',
];

export function isCancelSurveyReason(
  value: string,
): value is CancelSurveyReason {
  return (CANCEL_SURVEY_REASONS as readonly string[]).includes(value);
}

export type CancelSurveyState = {
  /** The card has already appeared for this account — ask once, ever. */
  asked: boolean;
  askedAt: number | null;
  submitted: boolean;
};

export function emptyCancelSurveyState(): CancelSurveyState {
  return { asked: false, askedAt: null, submitted: false };
}

export function parseCancelSurveyState(
  raw: string | undefined,
): CancelSurveyState {
  const fallback = emptyCancelSurveyState();
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback;
  const record = parsed as Record<string, unknown>;
  return {
    asked: record.asked === true,
    askedAt:
      typeof record.askedAt === 'number' && record.askedAt > 0
        ? record.askedAt
        : null,
    submitted: record.submitted === true,
  };
}

/** The card may appear only before its one ask — dismissal ends it forever. */
export function canShowCancelSurvey(state: CancelSurveyState): boolean {
  return !state.asked && !state.submitted;
}

// --- persistence ------------------------------------------------------------

const store = createMMKV({ id: 'cancel-survey' });

const stateKey = (userId: string) => `cancel.survey.${userId}`;

export function readCancelSurveyState(userId: string): CancelSurveyState {
  return parseCancelSurveyState(store.getString(stateKey(userId)));
}

export function writeCancelSurveyState(
  userId: string,
  state: CancelSurveyState,
): void {
  store.set(stateKey(userId), JSON.stringify(state));
}

/** Called when the card is displayed — the ask is spent even if dismissed. */
export function markCancelSurveyShown(userId: string): void {
  writeCancelSurveyState(userId, {
    ...readCancelSurveyState(userId),
    asked: true,
    askedAt: Date.now(),
  });
}

export function markCancelSurveySubmitted(userId: string): void {
  writeCancelSurveyState(userId, {
    ...readCancelSurveyState(userId),
    submitted: true,
  });
}

// --- analytics boundary -----------------------------------------------------

export const cancelSurveyAnalytics = {
  isAvailable(): boolean {
    return posthog !== undefined && !posthog.isDisabled && !posthog.optedOut;
  },

  shown(): void {
    analytics.capture('cancel_survey_shown');
  },

  dismissed(): void {
    analytics.capture('cancel_survey_dismissed');
  },

  submitted(reason: CancelSurveyReason): void {
    analytics.capture('cancel_survey_submitted', {
      reason,
      survey_source: 'next_visit_card',
    });
  },
};
