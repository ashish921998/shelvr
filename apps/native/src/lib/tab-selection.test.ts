import { describe, expect, it } from "vitest";
import {
  reconcileTabSelection,
  requestTabSelection,
  type TabSelection,
} from "./tab-selection";

const initial: TabSelection = { index: 0, revision: 0, pending: false };

describe("tab selection reconciliation", () => {
  it("keeps the latest rapid tap highlighted through an older navigation effect", () => {
    const first = requestTabSelection(initial, 1);
    const second = requestTabSelection(first, 2);
    const stale = reconcileTabSelection(second, 1, first.revision);
    const confirmed = reconcileTabSelection(stale, 2, second.revision);
    expect([second.index, stale.index, confirmed.index]).toEqual([2, 2, 2]);
    expect(confirmed.pending).toBe(false);
  });

  it("waits for navigation when the request state renders before the route", () => {
    const requested = requestTabSelection(initial, 2);
    expect(reconcileTabSelection(requested, 0, requested.revision)).toBe(
      requested,
    );
    expect(
      reconcileTabSelection(requested, 2, requested.revision).pending,
    ).toBe(false);
  });

  it("handles a rapid return to the original tab without accepting the intermediate tab", () => {
    const first = requestTabSelection(initial, 1);
    const second = requestTabSelection(first, 0);
    const confirmed = reconcileTabSelection(second, 0, second.revision);
    expect(confirmed).toEqual({ index: 0, revision: 2, pending: false });
    expect(reconcileTabSelection(confirmed, 1, first.revision)).toBe(confirmed);
  });

  it("acknowledges a tap on the already focused tab without a route change", () => {
    const requested = requestTabSelection(initial, 0);
    expect(reconcileTabSelection(requested, 0, requested.revision)).toEqual({
      index: 0,
      revision: 1,
      pending: false,
    });
  });

  it("follows Back and other navigation after the latest tap is acknowledged", () => {
    const requested = requestTabSelection(initial, 2);
    const confirmed = reconcileTabSelection(requested, 2, requested.revision);
    expect(reconcileTabSelection(confirmed, 0, requested.revision).index).toBe(
      0,
    );
  });

  it("keeps the return tab while Search is focused and follows navigation out", () => {
    const requested = requestTabSelection(initial, 2);
    const search = reconcileTabSelection(requested, -1, requested.revision);
    expect(search).toEqual({ index: 2, revision: 1, pending: false });
    expect(reconcileTabSelection(search, 1, requested.revision).index).toBe(1);
  });
});
