import { describe, expect, it } from "vitest";
import type { ReplayWork } from "./pending-onboarding";
import { createReplayLedger, sameReplayWork } from "./replay-ledger";

const work: ReplayWork = {
  operationId: "operation",
  spaces: ["Recipes", "Travel"],
  demoUrl: "https://example.com/queued",
};

describe("replay eligibility", () => {
  it("claims an identity once, including equivalent fresh reads", () => {
    const ledger = createReplayLedger();
    expect(ledger.claim(work)).not.toBeNull();
    expect(ledger.claim({ ...work, spaces: [...work.spaces] })).toBeNull();
  });

  it.each([
    { ...work, operationId: "new-operation" },
    { ...work, spaces: ["Travel", "Recipes"] },
    { ...work, spaces: ["Recipes"] },
    { ...work, demoUrl: null },
  ])("claims changed replay work independently: %j", (next) => {
    const ledger = createReplayLedger();
    ledger.claim(work);
    expect(ledger.claim(next)).not.toBeNull();
  });

  it("first settlement and unchanged reloads do not open an epoch", () => {
    const ledger = createReplayLedger();
    ledger.claim(work);
    ledger.settle(true);
    ledger.settle(true);
    expect(ledger.claim(work)).toBeNull();
  });

  it("eagerly opens an epoch on each settled entitlement flip", () => {
    const ledger = createReplayLedger();
    ledger.settle(true);
    ledger.claim(work);
    ledger.settle(false);
    expect(ledger.claim(work)).not.toBeNull();
    expect(ledger.claim(work)).toBeNull();
    ledger.settle(true);
    expect(ledger.claim(work)).not.toBeNull();
  });

  it("consumes predicted write-backs before their notification", () => {
    const ledger = createReplayLedger();
    const consume = ledger.claim(work);
    const remaining = { ...work, spaces: ["Travel"] };
    consume?.(remaining);
    expect(ledger.claim(remaining)).toBeNull();
    consume?.({ ...remaining, demoUrl: null });
    expect(ledger.claim({ ...remaining, demoUrl: null })).toBeNull();
  });

  it("keeps in-flight consumes bound to the old epoch after a flip", () => {
    const ledger = createReplayLedger();
    ledger.settle(true);
    const consume = ledger.claim(work);
    ledger.settle(false);
    const remaining = { ...work, spaces: ["Travel"] };
    consume?.(remaining);
    expect(ledger.claim(remaining)).not.toBeNull();
    expect(ledger.claim(remaining)).toBeNull();
  });

  it("starts a fresh ledger on remount", () => {
    createReplayLedger().claim(work);
    expect(createReplayLedger().claim(work)).not.toBeNull();
  });

  it("compares ordered snapshots and rejects an absent record", () => {
    expect(sameReplayWork(null, work)).toBe(false);
    expect(sameReplayWork({ ...work }, work)).toBe(true);
    expect(
      sameReplayWork({ ...work, spaces: ["Travel", "Recipes"] }, work),
    ).toBe(false);
  });
});
