import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import { freshAdders } from "./sharedLists";

const priya = "priya" as Id<"users">;
const sam = "sam" as Id<"users">;
const ana = "ana" as Id<"users">;
const nameless = "nameless" as Id<"users">;
const departed = "departed" as Id<"users">;

const names = new Map<Id<"users">, string | undefined>([
  [priya, "Priya"],
  [sam, "Sam"],
  [ana, "Ana"],
  [nameless, undefined],
]);

const added = (...adders: Id<"users">[]) =>
  adders.map((addedBy) => ({ addedBy }));

describe("freshAdders", () => {
  it("gives nothing when nothing is new", () => {
    expect(freshAdders([], names)).toEqual([]);
  });

  it("counts one named adder", () => {
    expect(freshAdders(added(priya, priya, priya), names)).toEqual([
      { firstName: "Priya", count: 3 },
    ]);
  });

  it("puts the busiest adder first, then sorts a tie by name", () => {
    expect(
      freshAdders(added(sam, priya, priya, ana, sam, priya), names),
    ).toEqual([
      { firstName: "Priya", count: 3 },
      { firstName: "Sam", count: 2 },
      { firstName: "Ana", count: 1 },
    ]);
    expect(freshAdders(added(sam, ana), names)).toEqual([
      { firstName: "Ana", count: 1 },
      { firstName: "Sam", count: 1 },
    ]);
  });

  it("merges a member with no name and a past member into one group, last", () => {
    expect(
      freshAdders(added(nameless, departed, priya, departed), names),
    ).toEqual([{ firstName: "Priya", count: 1 }, { count: 3 }]);
  });
});
