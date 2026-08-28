import { describe, expect, it } from 'vitest';

import {
  mapPaywallResult,
  shouldOpenPaywallFallback,
  type PaywallOutcome,
} from './paywall-result';

describe('mapPaywallResult', () => {
  it('treats purchase and restore as success', () => {
    expect(mapPaywallResult('PURCHASED')).toBe('success');
    expect(mapPaywallResult('RESTORED')).toBe('success');
  });

  it('treats an explicit cancel as cancelled', () => {
    expect(mapPaywallResult('CANCELLED')).toBe('cancelled');
  });

  it('treats missing, error, and not-presented results as unavailable', () => {
    expect(mapPaywallResult('NOT_PRESENTED')).toBe('unavailable');
    expect(mapPaywallResult('ERROR')).toBe('unavailable');
    expect(mapPaywallResult(null)).toBe('unavailable');
    expect(mapPaywallResult(undefined)).toBe('unavailable');
    expect(mapPaywallResult('SOMETHING_NEW')).toBe('unavailable');
  });
});

describe('shouldOpenPaywallFallback', () => {
  const cases: [PaywallOutcome, boolean][] = [
    ['success', false],
    ['cancelled', false],
    ['unavailable', true],
  ];

  it.each(cases)('%s → fallback %s', (outcome, expected) => {
    expect(shouldOpenPaywallFallback(outcome)).toBe(expected);
  });
});
