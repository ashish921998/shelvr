"use client";

import { useEffect, useRef, useState } from "react";

import PlanSketchbook, { type Choice } from "@/components/PlanSketchbook";
import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { useBrowserValue } from "@/lib/browserValue";
import type { PlanSharePlace } from "@/lib/planShare";

type Choices = Record<string, Choice>;
type Status = "idle" | "saving" | "saved" | "error";

const VOTER_KEY = "shelvr.planVoter";
const VOTE_SETTLE_MS = 600;
const NAME_SETTLE_MS = 800;

function ballot(
  token: string,
  voterId: string,
  choices: Choices,
  revision: number,
  name: string | undefined,
): string {
  const keys = Object.keys(choices);
  return JSON.stringify({
    token,
    voterId,
    picks: keys.filter((key) => choices[key] === "pick"),
    passes: keys.filter((key) => choices[key] === "pass"),
    revision,
    ...(name === undefined ? {} : { name: name.trim() }),
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
const nameKey = (token: string) => `shelvr.planVoterName.${token}`;

function storedName(token: string): string | undefined {
  const value = load(nameKey(token));
  return typeof value === "string" ? value : undefined;
}

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

function newestChoices(
  own: Ballot,
  stored: readonly (Ballot | undefined)[],
): Choices {
  let newest = own;
  for (const ballot of stored) {
    if (ballot && ballot.revision > newest.revision) newest = ballot;
  }
  return newest.choices;
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
  const remembered = useBrowserValue(() => storedName(token), undefined);
  const [typed, setTyped] = useState<string>();
  const nameRef = useRef<string | undefined>(undefined);
  const named = useRef(false);
  useEffect(() => {
    nameRef.current = typed ?? remembered;
  });

  const send = (next: Choices, revision: number, name: string | undefined) => {
    voter.current ??= voterId();
    const body = ballot(token, voter.current, next, revision, name);
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
      sendRef.current(resend.choices, resend.revision, storedName(token));
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
        body: ballot(
          token,
          voter.current,
          next.choices,
          next.revision,
          nameRef.current,
        ),
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
      send(next, revision, nameRef.current);
    }, VOTE_SETTLE_MS);
  };

  const onName = (value: string) => {
    const current = newestChoices(
      pending.current ?? { choices, revision: lastRevision.current },
      [storedBallot(savedKey(token)), storedBallot(pendingKey(token))],
    );
    if (current !== (pending.current?.choices ?? choices)) setChoices(current);
    const withVotes = Object.keys(current).length > 0;
    setTyped(value);
    nameRef.current = value;
    storeQuietly(nameKey(token), value);
    if (!named.current && value.trim() !== "") {
      named.current = true;
      captureWebAnalyticsEvent("plan_vote_named", { with_votes: withVotes });
    }
    if (!withVotes) return;
    clearTimeout(timer.current);
    const revision = nextRevision(lastRevision);
    pending.current = { choices: current, revision };
    setStatus("saving");
    timer.current = setTimeout(() => {
      pending.current = undefined;
      send(current, revision, nameRef.current);
    }, NAME_SETTLE_MS);
  };

  const flushName = () => {
    const next = pending.current;
    if (!next) return;
    clearTimeout(timer.current);
    pending.current = undefined;
    send(next.choices, next.revision, nameRef.current);
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
      <PlanSketchbook places={places} choices={choices} onChoose={choose} />
      <div className="mt-5">
        <label
          htmlFor="plan-voter-name"
          className="text-sm font-semibold text-ink"
        >
          Your first name (optional)
        </label>
        <input
          id="plan-voter-name"
          aria-describedby="plan-voter-name-help"
          value={typed ?? remembered ?? ""}
          onChange={(event) => onName(event.target.value)}
          onBlur={flushName}
          placeholder="First name"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={40}
          className="mt-1.5 h-11 w-full rounded-[11px] border border-line-strong bg-cream px-3.5 text-base font-medium text-ink outline-none placeholder:text-muted-soft focus:border-ember"
        />
        <p id="plan-voter-name-help" className="mt-1 text-xs text-muted">
          Shown to {senderName ?? "them"} next to your votes.
        </p>
      </div>
      <p
        role="status"
        className={`mt-5 text-center text-sm ${
          status === "error"
            ? "rounded-2xl bg-terracotta/10 px-4 py-3 text-terracotta"
            : "text-muted"
        }`}
      >
        {note}
      </p>
    </div>
  );
}
