import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_SURVEY_REASONS,
  cancelSurveyAnalytics,
  isCancelSurveyReason,
} from './cancel-survey';

const posthogMock = vi.hoisted(() => ({
  optedOut: false,
  isDisabled: false,
}));
vi.mock('@/lib/posthog', () => ({
  isAnalyticsAvailable: () => !posthogMock.isDisabled && !posthogMock.optedOut,
}));

const analyticsMock = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ analytics: analyticsMock }));

// Once-per-account persistence is server-side (convex/cancelSurvey.test.ts);
// this file covers the client boundary: bounded reasons and event payloads.
describe('cancelSurveyAnalytics', () => {
  beforeEach(() => {
    posthogMock.optedOut = false;
    posthogMock.isDisabled = false;
    vi.clearAllMocks();
  });

  it('emits shown with no properties — presentation carries no user data', () => {
    cancelSurveyAnalytics.shown();

    expect(analyticsMock.capture).toHaveBeenCalledWith('cancel_survey_shown');
  });

  it('emits submitted with a bounded reason id only', () => {
    cancelSurveyAnalytics.submitted('too_expensive');

    expect(analyticsMock.capture).toHaveBeenCalledWith(
      'cancel_survey_submitted',
      { reason: 'too_expensive', survey_source: 'next_visit_card' },
    );
  });

  it('emits dismissed', () => {
    cancelSurveyAnalytics.dismissed();

    expect(analyticsMock.capture).toHaveBeenCalledWith('cancel_survey_dismissed');
  });

  it('is unavailable when the client opted out', () => {
    posthogMock.optedOut = true;

    expect(cancelSurveyAnalytics.isAvailable()).toBe(false);
  });

  it('every reason id is a valid CancelSurveyReason and free text is not', () => {
    expect(CANCEL_SURVEY_REASONS).toEqual([
      'too_expensive',
      'not_useful_enough',
      'missing_feature',
      'other',
    ]);
    for (const reason of CANCEL_SURVEY_REASONS) {
      expect(isCancelSurveyReason(reason)).toBe(true);
    }
    expect(isCancelSurveyReason('too cheap')).toBe(false);
  });
});
