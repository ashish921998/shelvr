import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirectSystemPath } from '@/app/+native-intent';

const { markPendingShare } = vi.hoisted(() => ({
  markPendingShare: vi.fn(),
}));

vi.mock('@/lib/share/pending-share-store', () => ({ markPendingShare }));

describe('redirectSystemPath', () => {
  beforeEach(() => {
    markPendingShare.mockClear();
  });

  it.each([
    'shelvr://auth/callback?code=verification-code',
    'shelvr:///auth/callback?code=verification-code',
  ])('keeps OAuth callbacks on the sign-in route for %s', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe('/sign-in');
    expect(markPendingShare).not.toHaveBeenCalled();
  });

  it('continues routing share intents to the share receiver', () => {
    expect(
      redirectSystemPath({ path: 'shelvr://expo-sharing', initial: false }),
    ).toBe('/share');
    expect(markPendingShare).toHaveBeenCalledOnce();
  });

  it('leaves unrelated deep links untouched', () => {
    const path = 'shelvr:///add';
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
