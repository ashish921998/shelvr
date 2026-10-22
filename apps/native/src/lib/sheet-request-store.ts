type SheetRequestStore<T, R> = {
  subscribe(listener: () => void): () => void;
  current(): T | null;
  request(value: T): Promise<R>;
  resolve(result: R): void;
};

export function createSheetRequestStore<T, R>(
  superseded: R,
): SheetRequestStore<T, R> {
  let pending: { value: T; resolve: (result: R) => void } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function resolve(result: R): void {
    const open = pending;
    if (!open) return;
    pending = null;
    notify();
    open.resolve(result);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => pending?.value ?? null,
    request(value) {
      resolve(superseded);
      return new Promise((done) => {
        pending = { value, resolve: done };
        notify();
      });
    },
    resolve,
  };
}
