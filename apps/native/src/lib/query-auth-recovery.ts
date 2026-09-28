import type { Query, QueryClient } from '@tanstack/react-query';

/** Recover live queries once per error category during each authenticated session. */
export function observeAuthQueryErrors(
  client: QueryClient,
  restart: (queryHash: string) => void,
) {
  const attemptedAuth = new Set<string>();
  const attemptedOther = new Set<string>();
  const queued = new Set<string>();
  let stopped = false;
  const recover = (query: Query) => {
    if (stopped) return;
    if (
      query.queryKey[0] !== 'convexQuery' ||
      query.state.status !== 'error' ||
      query.getObserversCount() === 0
    )
      return;
    const attempted = String(query.state.error).includes('Not authenticated')
      ? attemptedAuth
      : attemptedOther;
    if (attempted.has(query.queryHash)) return;
    attempted.add(query.queryHash);
    restart(query.queryHash);
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'observerAdded') return;
    const { query } = event;
    if (query.state.status !== 'error' || queued.has(query.queryHash)) return;
    queued.add(query.queryHash);
    queueMicrotask(() => {
      queued.delete(query.queryHash);
      if (client.getQueryCache().get(query.queryHash) === query) recover(query);
    });
  });
  for (const query of client.getQueryCache().getAll()) recover(query);
  return () => {
    stopped = true;
    unsubscribe();
  };
}
