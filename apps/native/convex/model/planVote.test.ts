import { describe, expect, it } from "vitest";

import {
  latestVote,
  parsePlanVote,
  planVoteRefusal,
  planVoterName,
  pushSubject,
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

describe("pushSubject", () => {
  const places = [
    { key: "p0", name: "Jo's Coffee" },
    { key: "p1", name: "Houndstooth Coffee" },
    { key: "p2", name: "Franklin Barbecue" },
  ];
  const ballot = (
    voterId: string,
    updatedAt: number,
    fields: {
      name?: string;
      picks?: string[];
      passes?: string[];
      last?: { key: string; choice: "pick" | "pass"; at: number };
    },
  ) => ({ voterId, updatedAt, picks: [], passes: [], ...fields });

  it("names the first voter's newest pick", () => {
    expect(
      pushSubject(
        [
          ballot("sam", 9, { name: "Sam", picks: ["p0"] }),
          ballot("maya", 1, {
            name: "Maya",
            picks: ["p0", "p2"],
            last: { key: "p2", choice: "pick", at: 1 },
          }),
        ],
        "maya",
        places,
      ),
    ).toEqual({ name: "Maya", place: "Franklin Barbecue", choice: "pick" });
  });

  it("takes the first pick in shortlist order when the newest choice was a pass", () => {
    expect(
      pushSubject(
        [
          ballot("maya", 1, {
            picks: ["p2", "p1"],
            passes: ["p0"],
            last: { key: "p0", choice: "pass", at: 1 },
          }),
        ],
        "maya",
        places,
      ),
    ).toEqual({ place: "Houndstooth Coffee", choice: "pick" });
  });

  it("prefers anyone's pick, newest voter first, over the first voter's pass", () => {
    expect(
      pushSubject(
        [
          ballot("maya", 1, { name: "Maya", passes: ["p0"] }),
          ballot("sam", 2, { name: "Sam", picks: ["p1"] }),
          ballot("ana", 3, { name: "Ana", picks: ["p2"] }),
        ],
        "maya",
        places,
      ),
    ).toEqual({ name: "Ana", place: "Franklin Barbecue", choice: "pick" });
  });

  it("names a pass when nobody picked", () => {
    expect(
      pushSubject(
        [ballot("maya", 1, { name: "Maya", passes: ["p1", "p0"] })],
        "maya",
        places,
      ),
    ).toEqual({ name: "Maya", place: "Jo's Coffee", choice: "pass" });
  });

  it("skips a place whose save is gone", () => {
    expect(
      pushSubject(
        [
          ballot("maya", 1, {
            name: "Maya",
            picks: ["p9"],
            last: { key: "p9", choice: "pick", at: 1 },
          }),
          ballot("sam", 2, { name: "Sam", picks: ["p1"] }),
        ],
        "maya",
        places,
      ),
    ).toEqual({ name: "Sam", place: "Houndstooth Coffee", choice: "pick" });
    expect(
      pushSubject([ballot("maya", 1, { picks: ["p9"] })], "maya", places),
    ).toBeNull();
  });

  it("gives nothing without votes", () => {
    expect(pushSubject([], "maya", places)).toBeNull();
  });
});

describe("planVoteRefusal", () => {
  const sendable = {
    live: true,
    disabled: false,
    exhausted: false,
    expired: false,
    newest: true,
    subject: true,
  };

  it("lets a push through when nothing stops it", () => {
    expect(planVoteRefusal(sendable)).toBeNull();
  });

  it.each([
    [{ subject: false }, "no_items"],
    [{ subject: false, newest: false }, "superseded"],
    [{ subject: false, newest: false, expired: true }, "expired"],
    [
      { subject: false, newest: false, expired: true, exhausted: true },
      "retry_limit_reached",
    ],
    [
      {
        subject: false,
        newest: false,
        expired: true,
        exhausted: true,
        disabled: true,
      },
      "notifications_disabled",
    ],
    [
      {
        subject: false,
        newest: false,
        expired: true,
        exhausted: true,
        disabled: true,
        live: false,
      },
      "pushes_paused",
    ],
  ])("names the first reason that holds (%j)", (state, reason) => {
    expect(planVoteRefusal({ ...sendable, ...state })).toBe(reason);
  });
});
