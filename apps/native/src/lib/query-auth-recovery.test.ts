import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { observeAuthQueryErrors } from './query-auth-recovery';

describe('auth query recovery', () => {
  it('recovers existing and late errors with separate bounded auth and non-auth attempts', async () => {
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
    const nonAuth = makeQuery('non-auth');
    nonAuth.setState({
      status: 'error',
      error: new Error('ArgumentValidationError'),
    });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(3);
    expect(restart).toHaveBeenCalledWith(nonAuth.queryHash);
    nonAuth.setState({
      status: 'error',
      error: new Error('Another server error'),
    });
    late.setState({ status: 'error', error: new Error('Not authenticated') });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(3);
    nonAuth.setState({
      status: 'error',
      error: new Error('Not authenticated'),
    });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(4);
    nonAuth.setState({
      status: 'error',
      error: new Error('Not authenticated'),
    });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(4);
    stop();
    const after = makeQuery('after');
    after.setState({ status: 'error', error: new Error('Not authenticated') });
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(4);
    for (const unsubscribe of subscriptions) unsubscribe();
    client.clear();
  });

  it('skips healthy, inactive and non-Convex queries, and cancels queued recovery on cleanup', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } },
    });
    const subscriptions: (() => void)[] = [];
    for (const queryKey of [
      ['convexQuery', 'healthy'],
      ['other', 'failed'],
    ]) {
      const observer = new QueryObserver(client, { queryKey, enabled: false });
      subscriptions.push(observer.subscribe(() => {}));
    }
    client.setQueryData(['convexQuery', 'healthy'], 'ready');
    client.setQueryData(['convexQuery', 'inactive'], 'cached');
    const cache = client.getQueryCache();
    cache
      .find({ queryKey: ['convexQuery', 'inactive'] })!
      .setState({ status: 'error', error: new Error('Server failure') });
    cache
      .find({ queryKey: ['other', 'failed'] })!
      .setState({ status: 'error', error: new Error('Server failure') });
    const restart = vi.fn();
    const stop = observeAuthQueryErrors(client, restart);
    expect(restart).not.toHaveBeenCalled();
    const observer = new QueryObserver(client, {
      queryKey: ['convexQuery', 'inactive'],
      enabled: false,
    });
    subscriptions.push(observer.subscribe(() => {}));
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(1);
    expect(client.getDefaultOptions().queries?.staleTime).toBe(Infinity);
    expect(client.getQueryData(['convexQuery', 'healthy'])).toBe('ready');
    cache
      .find({ queryKey: ['convexQuery', 'healthy'] })!
      .setState({ status: 'error', error: new Error('Server failure') });
    stop();
    await Promise.resolve();
    expect(restart).toHaveBeenCalledTimes(1);
    for (const unsubscribe of subscriptions) unsubscribe();
    client.clear();
  });
});
