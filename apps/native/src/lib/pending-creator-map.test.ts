import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingCreatorMap,
  getPendingCreatorMap,
  parsePendingCreatorMap,
  setPendingCreatorMap,
  subscribePendingCreatorMap,
} from "./pending-creator-map";

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failRead: false,
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (store.failRead) throw new Error("keychain unavailable");
    return store.values.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    store.values.set(key, value);
  },
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function slot(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    token: TOKEN,
    city: "Mexico City",
    name: "Maya’s Mexico City",
    at: NOW,
    ...fields,
  });
}

beforeEach(() => {
  store.values.clear();
  store.failRead = false;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the pending creator map slot", () => {
  it("round-trips a save through set, get and clear", () => {
    expect(getPendingCreatorMap()).toBeNull();
    setPendingCreatorMap({
      token: TOKEN,
      city: "Mexico City",
      name: "Maya’s Mexico City",
    });
    const raw = getPendingCreatorMap();
    expect(parsePendingCreatorMap(raw, NOW)).toEqual({
      token: TOKEN,
      city: "Mexico City",
      name: "Maya’s Mexico City",
      at: NOW,
    });
    clearPendingCreatorMap();
    expect(getPendingCreatorMap()).toBeNull();
  });

  it("tells listeners about a set and a clear, until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingCreatorMap(listener);
    setPendingCreatorMap({ token: TOKEN, city: "Lima", name: "" });
    clearPendingCreatorMap();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    clearPendingCreatorMap();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("reads nothing when the keychain throws", () => {
    store.values.set("shelvr.pending.creatorMap", slot());
    store.failRead = true;
    expect(getPendingCreatorMap()).toBeNull();
  });
});

describe("parsePendingCreatorMap", () => {
  it("reads a fresh slot", () => {
    expect(parsePendingCreatorMap(slot(), NOW)?.city).toBe("Mexico City");
  });

  it.each([
    ["nothing", null],
    ["not JSON", "{token"],
    ["a bare string", JSON.stringify("Mexico City")],
    ["JSON null", "null"],
    ["no token", JSON.stringify({ city: "Lima", name: "", at: NOW })],
    ["no city", slot({ city: undefined })],
    ["no name", slot({ name: undefined })],
    ["no time", slot({ at: undefined })],
    ["a time that is text", slot({ at: String(NOW) })],
    ["a city that is a number", slot({ city: 7 })],
    ["a bad token", slot({ token: "nothex" })],
    ["an empty city", slot({ city: "" })],
    ["an 81-character city", slot({ city: "a".repeat(81) })],
    ["an expired slot", slot({ at: NOW - 24 * HOUR - 1 })],
    ["a slot from the future", slot({ at: NOW + 5 * 60 * 1000 + 1 })],
  ])("rejects %s", (_name, raw) => {
    expect(parsePendingCreatorMap(raw, NOW)).toBeNull();
  });

  it("keeps a slot right at the edges", () => {
    expect(
      parsePendingCreatorMap(slot({ at: NOW - 24 * HOUR }), NOW),
    ).not.toBeNull();
    expect(
      parsePendingCreatorMap(slot({ at: NOW + 5 * 60 * 1000 }), NOW),
    ).not.toBeNull();
    expect(
      parsePendingCreatorMap(slot({ city: "a".repeat(80) }), NOW),
    ).not.toBeNull();
  });

  it("accepts any name, since the server tidies it", () => {
    expect(
      parsePendingCreatorMap(slot({ name: "n".repeat(61) }), NOW)?.name,
    ).toHaveLength(61);
    expect(parsePendingCreatorMap(slot({ name: "" }), NOW)?.name).toBe("");
  });
});
