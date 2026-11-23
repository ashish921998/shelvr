import {
  parseKnownSaves,
  parseStoredView,
  type StoredView,
} from "@/lib/map-opening";
import { createMMKV } from "react-native-mmkv";

const store = createMMKV({ id: "map-opening" });

const VIEW_KEY = "map-opening.view";
const KNOWN_KEY = "map-opening.known-saves";
const OWNER_KEY = "map-opening.owner";

export function claimMapOpening(owner: string): void {
  if (store.getString(OWNER_KEY) === owner) return;
  store.remove(VIEW_KEY);
  store.remove(KNOWN_KEY);
  store.set(OWNER_KEY, owner);
}

export function readLastView(): StoredView | undefined {
  return parseStoredView(store.getString(VIEW_KEY));
}

export function writeLastView(view: StoredView): void {
  store.set(VIEW_KEY, JSON.stringify(view));
}

export function readKnownSaves(): ReadonlySet<string> | undefined {
  return parseKnownSaves(store.getString(KNOWN_KEY));
}

export function writeKnownSaves(ids: readonly string[]): void {
  const json = JSON.stringify([...new Set(ids)]);
  if (store.getString(KNOWN_KEY) !== json) store.set(KNOWN_KEY, json);
}

export function clearMapOpening(): void {
  store.remove(VIEW_KEY);
  store.remove(KNOWN_KEY);
  store.remove(OWNER_KEY);
}
