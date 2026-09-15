import { useSyncExternalStore } from "react";

// On Android the floating tab bar owns the search field and the Search tab
// renders the results. They are siblings under the tabs navigator, so the
// query lives in this small module store rather than in either of them. It is
// never persisted: a cold start begins empty, as the iOS search bar does.

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

/** The current tab-bar search text; re-renders the caller when it changes. */
export function useTabSearchQuery(): string {
  return useSyncExternalStore(subscribe, getTabSearchQuery, getTabSearchQuery);
}
