import type { ReplayWork } from "./pending-onboarding";

function identityOf(work: ReplayWork): string {
  return JSON.stringify([work.operationId, work.spaces, work.demoUrl]);
}

/** One attempt per ordered work identity per settled-entitlement epoch. */
export function createReplayLedger() {
  let settledEntitled: boolean | null = null;
  let attempted = new Set<string>();
  return {
    settle(entitled: boolean): void {
      if (settledEntitled !== null && settledEntitled !== entitled) {
        attempted = new Set();
      }
      settledEntitled = entitled;
    },
    claim(work: ReplayWork): ((next: ReplayWork) => void) | null {
      const identity = identityOf(work);
      if (attempted.has(identity)) return null;
      const epoch = attempted;
      epoch.add(identity);
      return (next) => {
        epoch.add(identityOf(next));
      };
    },
  };
}

/** Compare snapshots without giving store reads to the pure ledger. */
export function sameReplayWork(
  current: ReplayWork | null,
  expected: ReplayWork,
): boolean {
  return current !== null && identityOf(current) === identityOf(expected);
}
