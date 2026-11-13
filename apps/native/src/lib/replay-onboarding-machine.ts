export type ReplayState = {
  running: boolean;
  startedEntitled: boolean;
  rerun: boolean;
  awaitingEntitlement: boolean;
  settledWork: string | null;
  settledEntitled: boolean;
};

type PendingWork = { has: boolean; key: string };

export type ReplayInputs = {
  ready: boolean;
  entitled: boolean;
  paywallBlocked: boolean;
  readPending: () => PendingWork;
};

export type ReplayAction = "none" | "sell" | "save";

export type RunOutcome = {
  purchased: boolean;
  remainderKey: string | null;
  lateDemoUrl: boolean;
  accountChanged: boolean;
  pending: PendingWork;
};

export function initialReplay(entitled: boolean): ReplayState {
  return {
    running: false,
    startedEntitled: false,
    rerun: false,
    awaitingEntitlement: false,
    settledWork: null,
    settledEntitled: entitled,
  };
}

export function observeReplay(
  state: ReplayState,
  inputs: ReplayInputs,
): { state: ReplayState; action: ReplayAction } {
  const s =
    inputs.entitled === state.settledEntitled
      ? state
      : { ...state, settledEntitled: inputs.entitled, settledWork: null };
  if (!inputs.ready) return { state: s, action: "none" };
  if (s.running) {
    const rerun = s.rerun || inputs.entitled !== s.startedEntitled;
    return { state: { ...s, rerun }, action: "none" };
  }
  const pending = inputs.readPending();
  if (!pending.has || pending.key === s.settledWork) {
    return { state: s, action: "none" };
  }
  if (!inputs.entitled && (s.awaitingEntitlement || inputs.paywallBlocked)) {
    return { state: s, action: "none" };
  }
  return {
    state: {
      ...s,
      running: true,
      startedEntitled: inputs.entitled,
      awaitingEntitlement: inputs.entitled ? false : s.awaitingEntitlement,
    },
    action: inputs.entitled ? "save" : "sell",
  };
}

export function finishReplay(
  state: ReplayState,
  outcome: RunOutcome,
): { state: ReplayState; rerun: boolean } {
  const forced = state.rerun || outcome.lateDemoUrl || outcome.accountChanged;
  const settled = outcome.remainderKey !== null && !forced;
  const newWork =
    outcome.remainderKey !== null &&
    outcome.pending.has &&
    outcome.pending.key !== outcome.remainderKey;
  return {
    state: {
      ...state,
      running: false,
      rerun: false,
      awaitingEntitlement: state.awaitingEntitlement || outcome.purchased,
      settledWork: settled ? outcome.remainderKey : state.settledWork,
    },
    rerun: forced || newWork,
  };
}
