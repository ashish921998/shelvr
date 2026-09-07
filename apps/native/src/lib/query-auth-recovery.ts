import type { QueryClient } from '@tanstack/react-query';

/** Recover live queries once per error category during each authenticated session. */
export function observeAuthQueryErrors(
  client: QueryClient,
  restart: (queryHash: string) => void,
) {
  const attemptedAuth = new Set<string>();
  const attemptedOther = new Set<string>();
  let stopped = false;
  const recover = () => {
    if (stopped) return;
    for (const query of client.getQueryCache().getAll()) {
      if (
        query.queryKey[0] !== 'convexQuery' ||
        query.state.status !== 'error' ||
        query.getObserversCount() === 0
      )
        continue;
      const attempted = String(query.state.error).includes('Not authenticated')
        ? attemptedAuth
        : attemptedOther;
      if (attempted.has(query.queryHash)) continue;
      attempted.add(query.queryHash);
      restart(query.queryHash);
    }
  };
  const unsubscribe = client
    .getQueryCache()
    .subscribe(() => queueMicrotask(recover));
  recover();
  return () => {
    stopped = true;
    unsubscribe();
  };
}
