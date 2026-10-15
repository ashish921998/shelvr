"use client";

import { useEffect, useRef, useState } from "react";

import type { PlanSharePlace } from "@/lib/planShare";

type Choice = "pick" | "pass";
type Status = "idle" | "saving" | "saved" | "error";

const VOTER_KEY = "shelvr.planVoter";
const VOTE_SETTLE_MS = 600;

function ballot(
  token: string,
  voterId: string,
  choices: Record<string, Choice>,
): string {
  const keys = Object.keys(choices);
  return JSON.stringify({
    token,
    voterId,
    picks: keys.filter((key) => choices[key] === "pick"),
    passes: keys.filter((key) => choices[key] === "pass"),
  });
}

function rememberChoices(token: string, choices: Record<string, Choice>) {
  try {
    window.localStorage.setItem(
      `shelvr.planVote.${token}`,
      JSON.stringify(choices),
    );
  } catch {
    // A private window keeps the vote for this visit only.
  }
}

function storedChoices(token: string): Record<string, Choice> {
  try {
    const raw = window.localStorage.getItem(`shelvr.planVote.${token}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, Choice>)
      : {};
  } catch {
    return {};
  }
}

/** One id per browser, so a changed mind replaces the earlier vote. */
function voterId(): string {
  try {
    const existing = window.localStorage.getItem(VOTER_KEY);
    if (existing) return existing;
    const id = window.crypto.randomUUID();
    window.localStorage.setItem(VOTER_KEY, id);
    return id;
  } catch {
    return window.crypto.randomUUID();
  }
}

export default function PlanVote({
  token,
  places,
  senderName,
}: {
  token: string;
  places: PlanSharePlace[];
  senderName?: string;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>();
  const voter = useRef<string | undefined>(undefined);
  // Votes go out one at a time, so a slow request never lands after a newer one.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // localStorage only exists in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoices(storedChoices(token));
  }, [token]);

  // Taps settle for a moment before they go out, so toggling five places is
  // one request, not ten.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The ballot still waiting on that pause. Leaving the page sends it at once,
  // with keepalive so the request outlives the tab.
  const pending = useRef<Record<string, Choice> | undefined>(undefined);
  useEffect(() => {
    const leave = () => {
      clearTimeout(timer.current);
      const next = pending.current;
      pending.current = undefined;
      if (!next) return;
      voter.current ??= voterId();
      void fetch("/api/plan-vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: ballot(token, voter.current, next),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [token]);

  const send = (next: Record<string, Choice>) => {
    voter.current ??= voterId();
    const body = ballot(token, voter.current, next);
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch("/api/plan-vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (response.ok) {
          // Remembered only once saved, so a reload never shows a vote the
          // server didn't take.
          rememberChoices(token, next);
          setStatus("saved");
          setMessage(undefined);
          return;
        }
        const reply = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setStatus("error");
        setMessage(reply.message);
      } catch {
        setStatus("error");
        setMessage(undefined);
      }
    });
  };

  const choose = (key: string, choice: Choice) => {
    const next = { ...choices };
    if (next[key] === choice) delete next[key];
    else next[key] = choice;
    setChoices(next);
    setStatus("saving");
    clearTimeout(timer.current);
    pending.current = next;
    timer.current = setTimeout(() => {
      pending.current = undefined;
      send(next);
    }, VOTE_SETTLE_MS);
  };

  const who = senderName ?? "They";
  const note =
    status === "error"
      ? (message ?? "Couldn't save your vote. Try again.")
      : status === "saved"
        ? `Saved. ${who} sees your picks in the app.`
        : `${who} sees your picks in the app.`;

  return (
    <div>
      <ul className="space-y-2.5">
        {places.map((place) => (
          <li
            key={place.key}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5"
          >
            {place.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={place.imageUrl}
                alt=""
                className="h-14 w-14 flex-none rounded-xl object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-ember-soft font-display text-2xl text-shelf"
              >
                {place.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink">
                {place.name}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted">
                {place.area ? `${place.area} · ${place.why}` : place.why}
              </p>
            </div>
            <div className="flex flex-none gap-1.5">
              <VoteButton
                label={`Not ${place.name}`}
                active={choices[place.key] === "pass"}
                onClick={() => choose(place.key, "pass")}
              >
                ✕
              </VoteButton>
              <VoteButton
                label={`Yes to ${place.name}`}
                active={choices[place.key] === "pick"}
                tone="yes"
                onClick={() => choose(place.key, "pick")}
              >
                ✓
              </VoteButton>
            </div>
          </li>
        ))}
      </ul>
      <p
        role="status"
        className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
          status === "error"
            ? "bg-terracotta/10 text-terracotta"
            : "bg-paper-deep text-ink-soft"
        }`}
      >
        {note}
      </p>
    </div>
  );
}

function VoteButton({
  label,
  active,
  tone = "no",
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  tone?: "yes" | "no";
  onClick: () => void;
  children: string;
}) {
  const on =
    tone === "yes"
      ? "border-ember bg-ember text-dark"
      : "border-ink-soft bg-ink-soft text-cream";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        active ? on : "border-line-strong bg-cream text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
