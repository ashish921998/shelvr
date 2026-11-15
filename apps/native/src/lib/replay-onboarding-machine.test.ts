import { describe, expect, it } from "vitest";
import {
  finishReplay,
  initialReplay,
  observeReplay,
  type ReplayInputs,
  type ReplayState,
  type RunOutcome,
} from "./replay-onboarding-machine";

const work = { has: true, key: "work-1" };

function inputs(over: Partial<ReplayInputs> = {}): ReplayInputs {
  return {
    ready: true,
    entitled: true,
    paywallBlocked: false,
    readPending: () => work,
    ...over,
  };
}

function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  return {
    purchased: false,
    remainderKey: "work-1",
    lateDemoUrl: false,
    accountChanged: false,
    pending: { has: false, key: "" },
    ...over,
  };
}

function running(over: Partial<ReplayState> = {}): ReplayState {
  return {
    ...initialReplay(true),
    running: true,
    startedEntitled: true,
    ...over,
  };
}

describe("observeReplay", () => {
  it("does nothing until sign-in, the account, onboarding and entitlement are all ready", () => {
    let read = false;
    const step = observeReplay(
      initialReplay(true),
      inputs({ ready: false, readPending: () => ((read = true), work) }),
    );
    expect(step.action).toBe("none");
    expect(read).toBe(false);
  });

  it("saves queued work for an entitled account and clears a pending purchase wait", () => {
    const step = observeReplay(
      { ...initialReplay(true), awaitingEntitlement: true },
      inputs(),
    );
    expect(step.action).toBe("save");
    expect(step.state).toMatchObject({
      running: true,
      startedEntitled: true,
      awaitingEntitlement: false,
    });
  });

  it("sells to an account without Pro, unless the paywall is blocked or a purchase is landing", () => {
    expect(
      observeReplay(initialReplay(false), inputs({ entitled: false })).action,
    ).toBe("sell");
    expect(
      observeReplay(
        initialReplay(false),
        inputs({ entitled: false, paywallBlocked: true }),
      ).action,
    ).toBe("none");
    expect(
      observeReplay(
        { ...initialReplay(false), awaitingEntitlement: true },
        inputs({ entitled: false }),
      ).action,
    ).toBe("none");
  });

  it("does nothing with no work, or with work it already settled", () => {
    expect(
      observeReplay(
        initialReplay(true),
        inputs({ readPending: () => ({ has: false, key: "" }) }),
      ).action,
    ).toBe("none");
    expect(
      observeReplay({ ...initialReplay(true), settledWork: "work-1" }, inputs())
        .action,
    ).toBe("none");
  });

  it("forgets settled work when entitlement changes, so the work runs again", () => {
    const step = observeReplay(
      { ...initialReplay(false), settledWork: "work-1" },
      inputs({ entitled: true }),
    );
    expect(step.action).toBe("save");
    expect(step.state.settledEntitled).toBe(true);
  });

  it("marks a rerun, without starting a second run, when entitlement changes mid-run", () => {
    const step = observeReplay(running(), inputs({ entitled: false }));
    expect(step.action).toBe("none");
    expect(step.state.rerun).toBe(true);
    expect(
      observeReplay(step.state, inputs({ entitled: true })).state.rerun,
    ).toBe(true);
  });
});

describe("finishReplay", () => {
  it("settles finished work so it is not retried", () => {
    const done = finishReplay(running(), outcome());
    expect(done).toEqual({
      state: expect.objectContaining({ running: false, settledWork: "work-1" }),
      rerun: false,
    });
  });

  it("does not settle, and runs again, after a mid-run entitlement change, a late link or an account change", () => {
    for (const [state, over] of [
      [running({ rerun: true }), {}],
      [running(), { lateDemoUrl: true }],
      [running(), { accountChanged: true }],
    ] as const) {
      const done = finishReplay(state, outcome(over));
      expect(done.rerun).toBe(true);
      expect(done.state.settledWork).toBeNull();
      expect(done.state.rerun).toBe(false);
    }
  });

  it("runs again when new work arrived during a run", () => {
    expect(
      finishReplay(
        running(),
        outcome({ pending: { has: true, key: "work-2" } }),
      ).rerun,
    ).toBe(true);
  });

  it("waits for entitlement after a purchase from the replay's paywall, and settles nothing", () => {
    const done = finishReplay(
      running({ startedEntitled: false }),
      outcome({ purchased: true, remainderKey: null }),
    );
    expect(done.state).toMatchObject({
      awaitingEntitlement: true,
      settledWork: null,
    });
    expect(done.rerun).toBe(false);
  });

  it("keeps the paywall open to a later run after a decline in the same launch", () => {
    const done = finishReplay(
      running({ startedEntitled: false }),
      outcome({ remainderKey: null }),
    );
    expect(done.state.awaitingEntitlement).toBe(false);
    expect(observeReplay(done.state, inputs({ entitled: false })).action).toBe(
      "sell",
    );
  });
});
