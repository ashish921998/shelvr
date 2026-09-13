import { describe, expect, it } from 'vitest';

import { classifyTrialCancellation } from './trial-cancellation';

/** EntitlementInfo slices shaped like a RevenueCat CustomerInfo response. */
const entitlement = (
  overrides: Partial<{ periodType: string; willRenew: boolean }> = {},
) => ({
  periodType: 'NORMAL',
  willRenew: true,
  ...overrides,
});

describe('classifyTrialCancellation', () => {
  it('detects a cancelled trial still inside its window', () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: 'TRIAL', willRenew: false }),
      ]),
    ).toBe('cancelled');
  });

  it('treats a renewing trial, paid subscription, or empty entitlements as none', () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: 'TRIAL', willRenew: true }),
      ]),
    ).toBe('none');
    expect(classifyTrialCancellation([entitlement()])).toBe('none');
    expect(classifyTrialCancellation([])).toBe('none');
  });

  it('ignores non-trial entitlements when a trial is also present', () => {
    // Multiple active entitlements are possible; the trial decides.
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: 'NORMAL', willRenew: false }),
        entitlement({ periodType: 'TRIAL', willRenew: false }),
      ]),
    ).toBe('cancelled');
  });

  it('treats unfamiliar period types as non-trials', () => {
    expect(
      classifyTrialCancellation([
        entitlement({ periodType: 'INTRO', willRenew: false }),
      ]),
    ).toBe('none');
  });
});
