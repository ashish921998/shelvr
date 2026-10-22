import { useSyncExternalStore } from "react";

type Listener = () => void;

let query = "";
const listeners = new Set<Listener>();

export function getTabSearchQuery(): string {
  return query;
}

export function setTabSearchQuery(next: string): void {
  if (next === query) return;
  query = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTabSearchQuery(): string {
  return useSyncExternalStore(subscribe, getTabSearchQuery, getTabSearchQuery);
}
