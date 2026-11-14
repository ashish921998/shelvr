import { whenSheetSettled } from "@/lib/entitlement";
import { useEffect, useRef, useSyncExternalStore } from "react";

const ORDER = ["primer", "letter", "name"] as const;
type OneTimeSheet = (typeof ORDER)[number];
type Turn = { sheet: OneTimeSheet };

const waiting = new Set<Turn>();
const grants = new Map<Turn, () => void>();
const listeners = new Set<() => void>();
let current: Turn | null = null;
let holds = 0;
let granting = false;
let settleRound = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function grantNext(): void {
  if (granting || current !== null || holds > 0 || waiting.size === 0) return;
  granting = true;
  const round = settleRound;
  void whenSheetSettled().then(() => {
    granting = false;
    if (round !== settleRound) return grantNext();
    if (current !== null || holds > 0) return;
    const next = [...waiting].sort(
      (a, b) => ORDER.indexOf(a.sheet) - ORDER.indexOf(b.sheet),
    )[0];
    if (next === undefined) return;
    waiting.delete(next);
    current = next;
    grants.get(next)?.();
    grants.delete(next);
    notify();
  });
}

function queue(turn: Turn): void {
  waiting.add(turn);
  notify();
  grantNext();
}

function end(turn: Turn): void {
  waiting.delete(turn);
  grants.delete(turn);
  if (current === turn) {
    current = null;
    grantNext();
  }
  notify();
}

export function takeSheetTurn(sheet: OneTimeSheet): {
  granted: Promise<void>;
  end: () => void;
} {
  const turn = { sheet };
  const granted = new Promise<void>((resolve) => grants.set(turn, resolve));
  queue(turn);
  return { granted, end: () => end(turn) };
}

export function useSheetTurn(sheet: OneTimeSheet, wants: boolean): boolean {
  const turn = useRef<Turn | null>(null);
  useEffect(() => {
    if (!wants) return;
    const mine = { sheet };
    turn.current = mine;
    queue(mine);
    return () => {
      turn.current = null;
      end(mine);
    };
  }, [sheet, wants]);
  const up = useSyncExternalStore(
    subscribe,
    () => turn.current !== null && turn.current === current,
  );
  return wants && up;
}

export function useHoldSheetTurns(holding: boolean): void {
  useEffect(() => {
    if (!holding) return;
    holds += 1;
    settleRound += 1;
    notify();
    return () => {
      holds -= 1;
      grantNext();
      notify();
    };
  }, [holding]);
}

export function useSheetTurnUp(): boolean {
  return useSyncExternalStore(subscribe, () => current !== null);
}

export function useSheetTurnsBusy(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => current !== null || holds > 0 || waiting.size > 0,
  );
}
