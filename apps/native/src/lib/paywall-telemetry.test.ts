import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from './analytics';
import { observePaywallPresentation } from './paywall-telemetry';

vi.mock('./analytics', () => ({ analytics: { capture: vi.fn() } }));
const properties = { placement: 'onboarding', paywall_attempt_id: 'attempt-1' };
beforeEach(() => vi.clearAllMocks());

describe('paywall exposure and outcomes', () => {
  it('records the attempt before the native call settles, including interrupted sessions', async () => {
    let close: (result: string) => void = () => {};
    const native = new Promise<string>((resolve) => {
      close = resolve;
    });
    const outcome = observePaywallPresentation(properties, () => {
      expect(analytics.capture).toHaveBeenCalledWith(
        'paywall_presentation_started',
        properties,
      );
      return native;
    });
    expect(analytics.capture).toHaveBeenCalledTimes(1);
    close('CANCELLED');
    expect(await outcome).toBe('CANCELLED');
    expect(analytics.capture).toHaveBeenCalledWith('paywall_cancelled', {
      ...properties,
      duration_ms: expect.any(Number),
    });
  });

  it.each(['PURCHASED', 'RESTORED'])(
    'never treats client %s as server-confirmed payment',
    async (result) => {
      expect(
        await observePaywallPresentation(properties, async () => result),
      ).toBe(result);
      expect(analytics.capture).toHaveBeenCalledWith(
        result === 'PURCHASED'
          ? 'paywall_purchase_completed'
          : 'paywall_restored',
        expect.objectContaining(properties),
      );
      expect(analytics.capture).not.toHaveBeenCalledWith(
        'payment_succeeded',
        expect.anything(),
      );
      expect(analytics.capture).not.toHaveBeenCalledWith(
        'trial_started',
        expect.anything(),
      );
    },
  );

  it.each(['NOT_PRESENTED', 'ERROR', 'FUTURE_RESULT'])(
    'does not report a confirmed view for %s',
    async (result) => {
      expect(
        await observePaywallPresentation(properties, async () => result),
      ).toBe(result);
      expect(analytics.capture).toHaveBeenCalledWith(
        'paywall_failed',
        expect.objectContaining(properties),
      );
      expect(analytics.capture).not.toHaveBeenCalledWith(
        'paywall_shown',
        expect.anything(),
      );
    },
  );

  it('preserves SDK failure behavior and excludes raw error contents', async () => {
    const error = new Error('private store error');
    await expect(
      observePaywallPresentation(properties, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(analytics.capture).toHaveBeenLastCalledWith('paywall_failed', {
      ...properties,
      reason: 'presentation_exception',
      duration_ms: expect.any(Number),
    });
  });
});
