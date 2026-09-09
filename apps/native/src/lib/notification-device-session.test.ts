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
  const deps = {
    getToken: vi.fn(
      async (_requestPermission: boolean): Promise<string | null> => 'token-a',
    ),
    saveToken: vi.fn(async (_token: string) => {}),
    revokeToken: vi.fn(async (_token: string) => {}),
    setWeeklyShelf: vi.fn(async (_enabled: boolean) => {}),
    signOut: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => {}),
    resetAnalytics: vi.fn(),
    reportError: vi.fn(),
  };
  const session = new NotificationDeviceSession(
    {
      read: async () => tokens,
      write: async (next) => {
        tokens = next;
      },
    },
    deps,
  );
  session.start();
  return { session, deps };
}

describe('notification device session', () => {
  it('deduplicates overlapping boot and token-event registrations', async () => {
    const { session, deps } = setup();
    const saving = deferred();
    const save = deps.saveToken.mockImplementation(() => saving.promise);
    const one = session.register();
    const two = session.register();
    saving.resolve();
    expect(await one).toBe(true);
    expect(await two).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('drains an in-flight write before revoking and ending authentication', async () => {
    const { session, deps } = setup();
    const saving = deferred();
    const started = deferred();
    const events: string[] = [];
    deps.saveToken.mockImplementation(async () => {
      started.resolve();
      await saving.promise;
      events.push('registered');
    });
    const registration = session.register();
    await started.promise;
    deps.revokeToken.mockImplementation(async (token) => {
      events.push(`revoked:${token}`);
    });
    deps.signOut.mockImplementation(async () => {
      events.push('signed out');
    });
    const logout = session.signOut();
    const blocked = session.register(async () => 'token-b');
    saving.resolve();
    expect(await registration).toBe(false);
    await logout;
    expect(await blocked).toBe(false);
    expect(deps.saveToken).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['registered', 'revoked:token-a', 'signed out']);
  });

  it('does not let an old completion suppress a new account registration', async () => {
    const { session, deps } = setup();
    const saving = deferred();
    const started = deferred();
    deps.saveToken.mockImplementationOnce(async () => {
      started.resolve();
      await saving.promise;
    });
    const old = session.register();
    await started.promise;
    session.stop();
    session.start();
    const current = session.register();
    saving.resolve();
    expect(await old).toBe(false);
    expect(await current).toBe(true);
    expect(deps.saveToken).toHaveBeenCalledTimes(2);
  });

  it('does not write a token fetched after its auth session ends', async () => {
    const { session, deps } = setup();
    const fetching = deferred();
    const started = deferred();
    const registration = session.register(async () => {
      started.resolve();
      await fetching.promise;
      return 'token-a';
    });
    await started.promise;
    session.stop();
    fetching.resolve();
    expect(await registration).toBe(false);
    expect(deps.saveToken).not.toHaveBeenCalled();
  });

  it('revokes persisted tokens after a restart and does not sign out if revocation fails', async () => {
    const { session, deps } = setup(['token-a', 'token-old']);
    const end = deps.signOut;
    const revoke = deps.revokeToken.mockRejectedValueOnce(new Error('offline'));
    await expect(session.signOut()).rejects.toThrow('offline');
    expect(end).not.toHaveBeenCalled();
    await session.register();
    expect(deps.saveToken).toHaveBeenCalledWith('token-a');
    revoke.mockResolvedValue(undefined);
    await session.signOut();
    expect(revoke).toHaveBeenCalledWith('token-old');
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('owns permission, preference updates and mutual exclusion', async () => {
    const { session, deps } = setup();
    deps.getToken.mockResolvedValueOnce(null);
    expect(await session.setWeeklyShelf(true)).toBe(false);
    expect(deps.setWeeklyShelf).not.toHaveBeenCalled();
    const saving = deferred();
    deps.setWeeklyShelf.mockImplementationOnce(() => saving.promise);
    const update = session.setWeeklyShelf(true);
    expect(session.getSnapshot()).toBe('preferences');
    await session.signOut();
    await session.deleteAccount();
    expect(deps.signOut).not.toHaveBeenCalled();
    expect(deps.deleteAccount).not.toHaveBeenCalled();
    saving.resolve();
    expect(await update).toBe(true);
    expect(deps.getToken).toHaveBeenLastCalledWith(true);
    expect(deps.saveToken).toHaveBeenCalledBefore(deps.setWeeklyShelf);
    expect(session.getSnapshot()).toBe('idle');
    await session.setWeeklyShelf(false);
    expect(deps.setWeeklyShelf).toHaveBeenLastCalledWith(false);
    expect(deps.getToken).toHaveBeenCalledTimes(2);
  });

  it('restores registration after failed account deletion without ending authentication', async () => {
    const { session, deps } = setup(['token-a']);
    deps.deleteAccount.mockRejectedValueOnce(new Error('offline'));
    await expect(session.deleteAccount()).rejects.toThrow('offline');
    await session.register();
    expect(deps.saveToken).toHaveBeenCalledWith('token-a');
    expect(deps.signOut).not.toHaveBeenCalled();
    expect(deps.resetAnalytics).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe('idle');
  });

  it('keeps successful deletion successful when local cleanup fails', async () => {
    const { session, deps } = setup(['token-a']);
    deps.signOut.mockRejectedValueOnce(new Error('local cleanup failed'));
    await expect(session.deleteAccount()).resolves.toBeUndefined();
    expect(deps.revokeToken).toHaveBeenCalledBefore(deps.deleteAccount);
    expect(deps.deleteAccount).toHaveBeenCalledBefore(deps.signOut);
    expect(deps.resetAnalytics).toHaveBeenCalledOnce();
    expect(deps.reportError).toHaveBeenCalledOnce();
    expect(await session.register()).toBe(false);
    expect(deps.saveToken).not.toHaveBeenCalled();
  });
});
