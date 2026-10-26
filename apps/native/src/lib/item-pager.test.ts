import { describe, expect, it } from "vitest";
import { pagerResyncIndex } from "./item-pager";

const list = (...ids: string[]) => ids.map((_id) => ({ _id }));

describe("pagerResyncIndex", () => {
  it("follows an accepted suggestion to its place among the saved items", () => {
    expect(pagerResyncIndex(list("a", "b"), list("b", "a"), "a")).toBe(1);
  });

  it("follows the active save when an earlier one leaves the list", () => {
    expect(pagerResyncIndex(list("a", "b", "c"), list("b", "c"), "b")).toBe(0);
  });

  it("stays put when the active save keeps its index", () => {
    expect(
      pagerResyncIndex(list("a", "b"), list("a", "b", "c"), "b"),
    ).toBeNull();
  });

  it("leaves a vanished save to the delete and dismiss handlers", () => {
    expect(pagerResyncIndex(list("a", "b"), list("b"), "a")).toBeNull();
  });

  it("does nothing before the first list arrives", () => {
    expect(pagerResyncIndex(undefined, list("a"), "a")).toBeNull();
    expect(pagerResyncIndex(list("a"), undefined, "a")).toBeNull();
  });
});
