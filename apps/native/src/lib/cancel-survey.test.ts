import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_SURVEY_REASONS,
  canShowCancelSurvey,
  cancelSurveyAnalytics,
  emptyCancelSurveyState,
  isCancelSurveyReason,
  markCancelSurveyShown,
  markCancelSurveySubmitted,
  parseCancelSurveyState,
  readCancelSurveyState,
} from './cancel-survey';

const posthogMock = vi.hoisted(() => ({
  optedOut: false,
  isDisabled: false,
  capture: vi.fn(),
}));
vi.mock('@/lib/posthog', () => ({
  posthog: posthogMock,
  isAnalyticsAvailable: () => !posthogMock.isDisabled && !posthogMock.optedOut,
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { variant: 'development' } } },
}));

// In-memory MMKV so the storage boundary is exercised without a native runtime.
const kv = vi.hoisted(() => new Map<string, string>());
vi.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (key: string) => kv.get(key),
    set: (key: string, value: string) => void kv.set(key, value),
  }),
}));

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ analytics: analyticsMock }));

beforeEach(() => {
  posthogMock.optedOut = false;
  posthogMock.isDisabled = false;
  vi.clearAllMocks();
  kv.clear();
});

describe('cancel survey state', () => {
  it('asks at most once per account — showing or submitting ends it', () => {
    expect(canShowCancelSurvey(emptyCancelSurveyState())).toBe(true);
    expect(canShowCancelSurvey(parseCancelSurveyState(undefined))).toBe(true);

    markCancelSurveyShown('user-1');
    expect(canShowCancelSurvey(readCancelSurveyState('user-1'))).toBe(false);

    markCancelSurveySubmitted('user-2');
    expect(canShowCancelSurvey(readCancelSurveyState('user-2'))).toBe(false);
  });

  it('keeps the shown mark when a reason is later submitted', () => {
    markCancelSurveyShown('user-1');
    markCancelSurveySubmitted('user-1');
    expect(readCancelSurveyState('user-1')).toEqual({
      asked: true,
      askedAt: expect.any(Number),
      submitted: true,
    });
  });

  it('falls back to the empty state on malformed storage', () => {
    expect(parseCancelSurveyState('not json')).toEqual(emptyCancelSurveyState());
    expect(parseCancelSurveyState('{"asked":"yes"}')).toEqual(
      emptyCancelSurveyState(),
    );
    expect(parseCancelSurveyState('{"asked":true,"askedAt":-1}')).toEqual({
      asked: true,
      askedAt: null,
      submitted: false,
    });
  });

  it('scopes state per user', () => {
    markCancelSurveyShown('user-1');
    expect(canShowCancelSurvey(readCancelSurveyState('user-2'))).toBe(true);
  });
});

describe('cancel survey analytics', () => {
  it('captures a bounded reason and survey source — never free text', () => {
    cancelSurveyAnalytics.shown();
    cancelSurveyAnalytics.dismissed();
    cancelSurveyAnalytics.submitted('too_expensive');
    expect(analyticsMock.capture).toHaveBeenNthCalledWith(
      1,
      'cancel_survey_shown',
    );
    expect(analyticsMock.capture).toHaveBeenNthCalledWith(
      2,
      'cancel_survey_dismissed',
    );
    expect(analyticsMock.capture).toHaveBeenNthCalledWith(
      3,
      'cancel_survey_submitted',
      { reason: 'too_expensive', survey_source: 'next_visit_card' },
    );
    expect(JSON.stringify(analyticsMock.capture.mock.calls)).not.toMatch(
      /message|text/i,
    );
  });

  it('exposes availability from the PostHog client', () => {
    expect(cancelSurveyAnalytics.isAvailable()).toBe(true);
    posthogMock.optedOut = true;
    expect(cancelSurveyAnalytics.isAvailable()).toBe(false);
  });
});

describe('reason ids', () => {
  it('accepts only the fixed vocabulary', () => {
    for (const reason of CANCEL_SURVEY_REASONS) {
      expect(isCancelSurveyReason(reason)).toBe(true);
    }
    expect(isCancelSurveyReason('free text')).toBe(false);
    expect(isCancelSurveyReason('')).toBe(false);
  });
});
