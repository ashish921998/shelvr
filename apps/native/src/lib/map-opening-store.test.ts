import { beforeEach, expect, it, vi } from "vitest";
import {
  claimMapOpening,
  clearMapOpening,
  readKnownSaves,
  readLastView,
  writeKnownSaves,
  writeLastView,
} from "./map-opening-store";

const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => kv.get(key),
    set: (key: string, value: string) => void kv.set(key, value),
    remove: (key: string) => void kv.delete(key),
  }),
}));

beforeEach(() => {
  kv.clear();
});

it("keeps the last view and the saves it has shown", () => {
  expect(readLastView()).toBeUndefined();
  expect(readKnownSaves()).toBeUndefined();
  writeLastView({ lat: 1, lng: 2, zoom: 3 });
  writeKnownSaves(["a", "b", "a"]);
  expect(readLastView()).toEqual({ lat: 1, lng: 2, zoom: 3 });
  expect(readKnownSaves()).toEqual(new Set(["a", "b"]));
});

it("forgets both when the account leaves", () => {
  writeLastView({ lat: 1, lng: 2, zoom: 3 });
  writeKnownSaves(["a"]);
  clearMapOpening();
  expect(readLastView()).toBeUndefined();
  expect(readKnownSaves()).toBeUndefined();
});

it("forgets another account's map when a different account opens it", () => {
  claimMapOpening("user-a");
  writeLastView({ lat: 1, lng: 2, zoom: 3 });
  writeKnownSaves(["a"]);
  claimMapOpening("user-a");
  expect(readLastView()).toEqual({ lat: 1, lng: 2, zoom: 3 });
  claimMapOpening("user-b");
  expect(readLastView()).toBeUndefined();
  expect(readKnownSaves()).toBeUndefined();
});

it("ignores a stored view that is corrupt", () => {
  kv.set("map-opening.view", '{"lat":500,"lng":0,"zoom":3}');
  expect(readLastView()).toBeUndefined();
});
