import { describe, expect, it } from "vitest";

import {
  latestVote,
  parsePlanVote,
  planVoterName,
  voterFields,
} from "./planVote";

const ORDER = ["p0", "p1", "p2"];
const NOW = 1_000_000;

describe("parsePlanVote", () => {
  const body = { token: "t", voterId: "v", picks: ["p0"], passes: [] };

  it("passes a name through untouched and leaves it out when absent", () => {
    expect(parsePlanVote({ ...body, name: "  Maya Lopez " })).toEqual({
      ...body,
      name: "  Maya Lopez ",
    });
    expect(parsePlanVote(body)).not.toHaveProperty("name");
  });

  it("refuses a name that is not a string or is too long", () => {
    expect(parsePlanVote({ ...body, name: "x".repeat(64) })).not.toBeNull();
    expect(parsePlanVote({ ...body, name: "x".repeat(65) })).toBeNull();
    expect(parsePlanVote({ ...body, name: 7 })).toBeNull();
    expect(parsePlanVote({ ...body, name: null })).toBeNull();
  });
});

describe("planVoterName", () => {
  it.each([
    ["Maya Lopez", "Maya"],
    ["José", "José"],
    ["Anne-Marie", "Anne-Marie"],
    ["O’Brien", "O’Brien"],
    ["Zoe\u0308", "Zoe\u0308"],
    ["evil.com", undefined],
    ["a@b", undefined],
    ["👋", undefined],
    ["", undefined],
    ["   ", undefined],
    ["-", undefined],
    ["'", undefined],
    ["’’", undefined],
    ["--", undefined],
    ["\u0301", undefined],
  ])("%j gives %j", (raw, name) => {
    expect(planVoterName(raw)).toBe(name);
  });
});

describe("voterFields", () => {
  const row = (fields: {
    name?: string;
    picks?: string[];
    passes?: string[];
    last?: { key: string; choice: "pick" | "pass"; at: number };
  }) => ({ picks: [], passes: [], ...fields });

  it("takes the furthest new pick of a first ballot as the newest choice", () => {
    expect(
      voterFields(null, { picks: ["p2", "p0"], passes: ["p1"] }, ORDER, NOW),
    ).toEqual({
      name: undefined,
      last: { key: "p2", choice: "pick", at: NOW },
    });
  });

  it("takes a newly added pass when no pick was added", () => {
    const previous = row({
      picks: ["p0"],
      last: { key: "p0", choice: "pick", at: 1 },
    });
    expect(
      voterFields(previous, { picks: ["p0"], passes: ["p1"] }, ORDER, NOW).last,
    ).toEqual({ key: "p1", choice: "pass", at: NOW });
  });

  it("falls back to the previous choice while it still holds, else to none", () => {
    const previous = row({
      picks: ["p0", "p1"],
      last: { key: "p0", choice: "pick", at: 1 },
    });
    expect(
      voterFields(previous, { picks: ["p0"], passes: [] }, ORDER, NOW).last,
    ).toEqual({ key: "p0", choice: "pick", at: 1 });
    expect(
      voterFields(previous, { picks: ["p1"], passes: [] }, ORDER, NOW).last,
    ).toBeUndefined();
    expect(
      voterFields(previous, { picks: ["p1"], passes: ["p0"] }, ORDER, NOW).last,
    ).toEqual({ key: "p0", choice: "pass", at: NOW });
  });

  it("keeps the name when the ballot has none, and clears it with an empty one", () => {
    const previous = row({ name: "Maya", picks: ["p0"] });
    const ballot = { picks: ["p0"], passes: [] };
    expect(voterFields(previous, ballot, ORDER, NOW).name).toBe("Maya");
    expect(
      voterFields(previous, { ...ballot, name: "" }, ORDER, NOW).name,
    ).toBeUndefined();
    expect(
      voterFields(previous, { ...ballot, name: "Sam Reyes" }, ORDER, NOW).name,
    ).toBe("Sam");
  });
});

describe("latestVote", () => {
  const places = [
    { key: "p0", name: "Jo's Coffee" },
    { key: "p1", name: "Houndstooth Coffee" },
  ];

  it("names the vote with the newest choice", () => {
    expect(
      latestVote(
        [
          {
            name: "Sam",
            picks: ["p0"],
            passes: [],
            last: { key: "p0", choice: "pick", at: 2 },
          },
          {
            picks: [],
            passes: ["p1"],
            last: { key: "p1", choice: "pass", at: 3 },
          },
        ],
        places,
      ),
    ).toEqual({ place: "Houndstooth Coffee", choice: "pass" });
  });

  it("skips a choice on a place that is no longer shown", () => {
    expect(
      latestVote(
        [
          {
            name: "Sam",
            picks: ["p0"],
            passes: [],
            last: { key: "p0", choice: "pick", at: 2 },
          },
          {
            name: "Maya",
            picks: ["p2"],
            passes: [],
            last: { key: "p2", choice: "pick", at: 3 },
          },
        ],
        places,
      ),
    ).toEqual({ name: "Sam", place: "Jo's Coffee", choice: "pick" });
  });

  it("gives nothing when no vote has a newest choice", () => {
    expect(latestVote([{ picks: ["p0"], passes: [] }], places)).toBeUndefined();
    expect(latestVote([], places)).toBeUndefined();
  });
});
