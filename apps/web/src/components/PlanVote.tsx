"use client";

import { useEffect, useRef, useState } from "react";

import type { PlanSharePlace } from "@/lib/planShare";

type Choice = "pick" | "pass";
type Choices = Record<string, Choice>;
type Status = "idle" | "saving" | "saved" | "error";

const VOTER_KEY = "shelvr.planVoter";
const VOTE_SETTLE_MS = 600;

function ballot(
  token: string,
  voterId: string,
  choices: Choices,
  revision: number,
): string {
  const keys = Object.keys(choices);
  return JSON.stringify({
    token,
    voterId,
    picks: keys.filter((key) => choices[key] === "pick"),
    passes: keys.filter((key) => choices[key] === "pass"),
    revision,
  });
}

function storeQuietly(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function forgetQuietly(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

function load(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function isChoices(value: unknown): value is Choices {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const savedKey = (token: string) => `shelvr.planVote.${token}`;
const pendingKey = (token: string) => `shelvr.planVotePending.${token}`;

type Ballot = { choices: Choices; revision: number };

function storedBallot(key: string): Ballot | undefined {
  const value = load(key);
  if (!isChoices(value)) return undefined;
  const { choices, revision } = value as Partial<Ballot>;
  if (isChoices(choices) && typeof revision === "number") {
    return { choices, revision };
  }
  return { choices: value, revision: 0 };
}

function storeIfNewer(key: string, ballot: Ballot) {
  const current = storedBallot(key);
  if (current && current.revision > ballot.revision) return;
  storeQuietly(key, ballot);
}

function nextRevision(last: { current: number }): number {
  last.current = Math.max(Date.now(), last.current + 1);
  return last.current;
}

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
  const [choices, setChoices] = useState<Choices>({});
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>();
  const voter = useRef<string | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastRevision = useRef(0);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Ballot | undefined>(undefined);
  const queued = useRef<Ballot | undefined>(undefined);
  const sentOnLeave = useRef(0);

  const send = (next: Choices, revision: number) => {
    voter.current ??= voterId();
    const body = ballot(token, voter.current, next, revision);
    storeIfNewer(pendingKey(token), { choices: next, revision });
    queued.current = { choices: next, revision };
    queue.current = queue.current.then(async () => {
      if (revision <= sentOnLeave.current) return;
      if (queued.current?.revision === revision) queued.current = undefined;
      try {
        const response = await fetch("/api/plan-vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        });
        if (response.ok) {
          storeIfNewer(savedKey(token), { choices: next, revision });
          if ((storedBallot(pendingKey(token))?.revision ?? 0) <= revision) {
            forgetQuietly(pendingKey(token));
          }
          if (revision === lastRevision.current) {
            setStatus("saved");
            setMessage(undefined);
          }
          return;
        }
        const reply = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        if (revision !== lastRevision.current) return;
        setStatus("error");
        setMessage(reply.message);
      } catch {
        if (revision !== lastRevision.current) return;
        setStatus("error");
        setMessage(undefined);
      }
    });
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    const saved = storedBallot(savedKey(token));
    const left = storedBallot(pendingKey(token));
    const resend =
      left && left.revision > (saved?.revision ?? -1) ? left : undefined;
    lastRevision.current = Math.max(
      lastRevision.current,
      saved?.revision ?? 0,
      left?.revision ?? 0,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoices(resend?.choices ?? saved?.choices ?? {});
    if (resend) {
      setStatus("saving");
      sendRef.current(resend.choices, resend.revision);
    }
  }, [token]);

  useEffect(() => {
    const leave = () => {
      clearTimeout(timer.current);
      const next = pending.current ?? queued.current;
      pending.current = undefined;
      queued.current = undefined;
      if (!next) return;
      sentOnLeave.current = Math.max(sentOnLeave.current, next.revision);
      voter.current ??= voterId();
      storeIfNewer(pendingKey(token), next);
      void fetch("/api/plan-vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: ballot(token, voter.current, next.choices, next.revision),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [token]);

  const choose = (key: string, choice: Choice) => {
    const next = { ...choices };
    if (next[key] === choice) delete next[key];
    else next[key] = choice;
    setChoices(next);
    setStatus("saving");
    clearTimeout(timer.current);
    const revision = nextRevision(lastRevision);
    pending.current = { choices: next, revision };
    timer.current = setTimeout(() => {
      pending.current = undefined;
      send(next, revision);
    }, VOTE_SETTLE_MS);
  };

  const who = senderName ?? "They";
  const note =
    status === "error"
      ? (message ?? "Couldn't save your vote. Try again.")
      : status === "saved"
        ? `Saved. ${who} will see your picks in the app.`
        : `${who} will see your picks in the app.`;

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
