import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { observeAuthQueryErrors } from './query-auth-recovery';

describe('auth query recovery', () => {
  it('recovers existing and late auth errors once, and ignores unrelated errors', async () => {
    const client = new QueryClient();
    const subscriptions: (() => void)[] = [];
    const makeQuery = (name: string) => {
      const options = {
        queryKey: ['convexQuery', name],
        enabled: false,
        gcTime: Infinity,
      };
      const observer = new QueryObserver(client, options);
      subscriptions.push(observer.subscribe(() => {}));
      return client.getQueryCache().find({ queryKey: options.queryKey })!;
    };
    const first = makeQuery('first');
    first.setState({ status: 'error', error: new Error('Not authenticated') });
    const restart = vi.fn();
    const stop = observeAuthQueryErrors(client, restart);
    expect(restart).toHaveBeenCalledWith(first.queryHash);
    const late = makeQuery('late');
    late.setState({ status: 'error', error: new Error('Not authenticated') });
    const unrelated = makeQuery('unrelated');
    unrelated.setState({
      status: 'error',
      error: new Error('ArgumentValidationError'),
    });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(2);
    late.setState({ status: 'error', error: new Error('Not authenticated') });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(2);
    stop();
    const after = makeQuery('after');
    after.setState({ status: 'error', error: new Error('Not authenticated') });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(2);
    for (const unsubscribe of subscriptions) unsubscribe();
    client.clear();
  });
});
