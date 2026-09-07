import { describe, expect, it, vi } from 'vitest';
import { NotificationDeviceSession } from './notification-device-session';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(initial: string[] = []) {
  let tokens = initial;
  const session = new NotificationDeviceSession({
    read: async () => tokens,
    write: async (next) => {
      tokens = next;
    },
  });
  session.start();
  return session;
}

describe('notification device session', () => {
  it('deduplicates overlapping boot and token-event registrations', async () => {
    const session = setup();
    const saving = deferred();
    const save = vi.fn(() => saving.promise);
    const one = session.register(async () => 'token-a', save);
    const two = session.register(async () => 'token-a', save);
    saving.resolve();
    expect(await one).toBe(true);
    expect(await two).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('drains an in-flight write before revoking and ending authentication', async () => {
    const session = setup();
    const saving = deferred();
    const started = deferred();
    const events: string[] = [];
    const registration = session.register(
      async () => 'token-a',
      async () => {
        started.resolve();
        await saving.promise;
        events.push('registered');
      },
    );
    await started.promise;
    const logout = session.signOut(
      async (token) => {
        events.push(`revoked:${token}`);
      },
      async () => {
        events.push('signed out');
      },
    );
    const blockedSave = vi.fn();
    const blocked = session.register(async () => 'token-b', blockedSave);
    saving.resolve();
    expect(await registration).toBe(false);
    await logout;
    expect(await blocked).toBe(false);
    expect(blockedSave).not.toHaveBeenCalled();
    expect(events).toEqual(['registered', 'revoked:token-a', 'signed out']);
  });

  it('does not let an old completion suppress a new account registration', async () => {
    const session = setup();
    const saving = deferred();
    const started = deferred();
    const old = session.register(
      async () => 'token-a',
      async () => {
        started.resolve();
        await saving.promise;
      },
    );
    await started.promise;
    session.stop();
    session.start();
    const newSave = vi.fn();
    const current = session.register(async () => 'token-a', newSave);
    saving.resolve();
    expect(await old).toBe(false);
    expect(await current).toBe(true);
    expect(newSave).toHaveBeenCalledWith('token-a');
  });

  it('does not write a token fetched after its auth session ends', async () => {
    const session = setup();
    const fetching = deferred();
    const started = deferred();
    const save = vi.fn();
    const registration = session.register(async () => {
      started.resolve();
      await fetching.promise;
      return 'token-a';
    }, save);
    await started.promise;
    session.stop();
    fetching.resolve();
    expect(await registration).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('revokes persisted tokens after a restart and does not sign out if revocation fails', async () => {
    const session = setup(['token-a', 'token-old']);
    const end = vi.fn();
    const revoke = vi.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(session.signOut(revoke, end)).rejects.toThrow('offline');
    expect(end).not.toHaveBeenCalled();
    revoke.mockResolvedValue(undefined);
    await session.signOut(revoke, end);
    expect(revoke).toHaveBeenCalledWith('token-old');
    expect(end).toHaveBeenCalledTimes(1);
  });
});
