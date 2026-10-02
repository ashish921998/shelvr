/**
 * One sheet that non-React code opens and awaits. `request` shows `value` and
 * resolves with whatever `resolve` is later called with; a host component
 * reads `current` through `useSyncExternalStore` and renders the sheet while
 * it is set. Only one request is open at a time: a new one resolves the
 * pending one with `superseded` first, so no caller is left waiting forever.
 */
export type SheetRequestStore<T, R> = {
  subscribe(listener: () => void): () => void;
  /** The open request's value, or null when no sheet is open. */
  current(): T | null;
  /** Opens the sheet with `value`, superseding any open one. */
  request(value: T): Promise<R>;
  /** Closes the open sheet with `result`. Does nothing when none is open. */
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
