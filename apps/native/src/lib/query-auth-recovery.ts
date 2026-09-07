import type { QueryClient } from '@tanstack/react-query';

/** Install for one authenticated session, including auth errors that arrive after sign-in. */
export function observeAuthQueryErrors(
  client: QueryClient,
  restart: (queryHash: string) => void,
) {
  const attempted = new Set<string>();
  let stopped = false;
  const recover = () => {
    if (stopped) return;
    for (const query of client.getQueryCache().getAll()) {
      if (
        query.queryKey[0] !== 'convexQuery' ||
        query.state.status !== 'error' ||
        query.getObserversCount() === 0 ||
        attempted.has(query.queryHash) ||
        !String(query.state.error).includes('Not authenticated')
      )
        continue;
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
