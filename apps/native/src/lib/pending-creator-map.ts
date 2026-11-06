import { isPublicMapToken } from "@convex/model/publicMap";
import { MAX_CITY_CHARS } from "@convex/model/trip";
import * as SecureStore from "expo-secure-store";

const PENDING_CREATOR_MAP_KEY = "shelvr.pending.creatorMap";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 5 * 60 * 1000;

export type PendingCreatorMap = {
  token: string;
  city: string;
  name: string;
  at: number;
};

const listeners = new Set<() => void>();

function notifyChanged() {
  for (const listener of listeners) listener();
}

export function subscribePendingCreatorMap(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingCreatorMap(): string | null {
  try {
    const raw = SecureStore.getItem(PENDING_CREATOR_MAP_KEY);
    return raw === null || raw === "" ? null : raw;
  } catch {
    return null;
  }
}

export function setPendingCreatorMap(pending: {
  token: string;
  city: string;
  name: string;
}): void {
  const slot: PendingCreatorMap = { ...pending, at: Date.now() };
  SecureStore.setItem(PENDING_CREATOR_MAP_KEY, JSON.stringify(slot));
  notifyChanged();
}

export function clearPendingCreatorMap(): void {
  SecureStore.setItem(PENDING_CREATOR_MAP_KEY, "");
  notifyChanged();
}

function slotFields(raw: string): PendingCreatorMap | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { token, city, name, at } = value as Record<string, unknown>;
  if (typeof token !== "string" || typeof city !== "string") return null;
  if (typeof name !== "string" || typeof at !== "number") return null;
  return { token, city, name, at };
}

export function pendingCreatorMapToken(raw: string | null): string | null {
  return raw === null ? null : (slotFields(raw)?.token ?? null);
}

export function parsePendingCreatorMap(
  raw: string | null,
  now: number,
): PendingCreatorMap | null {
  const slot = raw === null ? null : slotFields(raw);
  if (slot === null || !isPublicMapToken(slot.token)) return null;
  if (slot.city.length === 0 || slot.city.length > MAX_CITY_CHARS) return null;
  if (now - slot.at > MAX_AGE_MS || slot.at - now > MAX_AHEAD_MS) return null;
  return slot;
}
