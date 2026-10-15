"use client";

import { type ComponentType, useEffect, useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import type {
  OracleInput,
  OracleInputProps,
  OracleMode,
  OracleVerdict,
} from "@/lib/oracle";

import LibraryInput from "./LibraryInput";
import LinksInput from "./LinksInput";
import LockedSpaces from "./LockedSpaces";
import ScreenshotInput from "./ScreenshotInput";
import ShareRow from "./ShareRow";
import StoreCta from "./StoreCta";
import TabsInput from "./TabsInput";
import VerdictCard from "./VerdictCard";

// Screenshot is the default: one tap into the camera roll, nothing to find.
const DEFAULT_MODE: OracleMode = "screenshot";

const MODES: Record<
  OracleMode,
  {
    name: string;
    short: string;
    hook: string;
    Input: ComponentType<OracleInputProps>;
  }
> = {
  screenshot: {
    name: "Screenshot Confession",
    short: "A screenshot",
    hook: "One screenshot from your camera roll. I’ll guess what it was for.",
    Input: ScreenshotInput,
  },
  links: {
    name: "Saver Oracle",
    short: "3 saved links",
    hook: "Paste 3 links you saved. I’ll guess why.",
    Input: LinksInput,
  },
  tabs: {
    name: "Tab Roast",
    short: "My open tabs",
    hook: "How many tabs are open right now? Be honest.",
    Input: TabsInput,
  },
  library: {
    name: "Saved-but-never-opened report",
    short: "A bookmarks export",
    hook: "Paste your bookmarks export. Get the damage report.",
    Input: LibraryInput,
  },
};

type OracleState =
  | { phase: "asking"; mode: OracleMode; error?: string }
  | { phase: "consulting"; mode: OracleMode }
  | {
      phase: "answered";
      mode: OracleMode;
      input: OracleInput;
      verdict: OracleVerdict;
      unlocked: boolean;
    };

function isOracleMode(value: string | null): value is OracleMode {
  return value !== null && Object.hasOwn(MODES, value);
}

export default function OracleApp() {
  const [state, setState] = useState<OracleState>({
    phase: "asking",
    mode: DEFAULT_MODE,
  });

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (isOracleMode(mode)) {
      // The query string only exists in the browser, after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ phase: "asking", mode });
      captureWebAnalyticsEvent("oracle_opened", { mode });
    } else {
      captureWebAnalyticsEvent("oracle_opened");
    }
  }, []);

  async function consult(input: OracleInput) {
    const mode = input.kind;
    setState({ phase: "consulting", mode });
    captureWebAnalyticsEvent("oracle_started", { mode });
    let status = 0;
    let message: string | undefined;
    try {
      const response = await fetch("/api/oracle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      status = response.status;
      const body = (await response.json().catch(() => ({}))) as Partial<
        OracleVerdict & { message: string }
      >;
      if (response.ok && body.persona) {
        const verdict = body as OracleVerdict;
        // The persona is read from the visitor's saves, so it stays out of
        // analytics.
        captureWebAnalyticsEvent("oracle_verdict", { mode });
        setState({ phase: "answered", mode, input, verdict, unlocked: false });
        return;
      }
      message = body.message;
    } catch {
      message = undefined;
    }
    captureWebAnalyticsEvent("oracle_failed", { mode, status });
    setState({
      phase: "asking",
      mode,
      error: message ?? "The oracle lost the thread. Try again.",
    });
  }

  return (
    <div className="container max-w-2xl pb-16 pt-10 sm:pt-14">
      <p className="section-kicker">The Shelvr Oracle</p>
      <h1 className="display mt-4 text-4xl leading-[1.08] text-ink sm:text-5xl">
        Show me what you saved and I’ll tell you who you are.
      </h1>

      {(state.phase === "asking" || state.phase === "consulting") && (
        <ModePanel
          state={state}
          onPick={(mode) => setState({ phase: "asking", mode })}
          onSubmit={consult}
        />
      )}

      {state.phase === "answered" && (
        <section className="mt-8" aria-live="polite">
          <VerdictCard
            verdict={state.verdict}
            stats={
              state.input.kind === "library" ? state.input.stats : undefined
            }
          />
          <LockedSpaces
            names={state.verdict.moreSpaces ?? []}
            unlocked={state.unlocked}
          />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <ShareRow
              mode={state.mode}
              verdict={state.verdict}
              onShared={() =>
                setState((current) =>
                  current.phase === "answered"
                    ? { ...current, unlocked: true }
                    : current,
                )
              }
            />
            <button
              type="button"
              onClick={() => setState({ phase: "asking", mode: state.mode })}
              className="min-h-12 rounded-xl px-5 text-base font-semibold text-muted underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep"
            >
              Ask the oracle again
            </button>
          </div>
          <StoreCta note="7-day trial on the annual plan." />
        </section>
      )}
    </div>
  );
}

function ModePanel({
  state,
  onPick,
  onSubmit,
}: {
  state: Extract<OracleState, { phase: "asking" | "consulting" }>;
  onPick: (mode: OracleMode) => void;
  onSubmit: (input: OracleInput) => void;
}) {
  const { name, hook, Input } = MODES[state.mode];
  const busy = state.phase === "consulting";
  const others = (Object.keys(MODES) as OracleMode[]).filter(
    (mode) => mode !== state.mode,
  );
  return (
    <>
      <section className="soft-card mt-8 rounded-3xl p-5 sm:p-8">
        <h2 className="text-2xl font-bold text-ink">{name}</h2>
        <p className="mt-1 text-base text-muted">{hook}</p>
        <div className="mt-5">
          {/* Keyed so switching modes starts the new input empty. */}
          <Input key={state.mode} busy={busy} onSubmit={onSubmit} />
        </div>
        {state.phase === "asking" && state.error && (
          <p role="alert" className="mt-4 text-sm font-medium text-ember-deep">
            {state.error}
          </p>
        )}
      </section>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">Or show me</span>
        {others.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onPick(mode)}
            disabled={busy}
            className="min-h-11 rounded-full border border-line-strong bg-white px-4 text-sm font-semibold text-ink transition hover:border-ember-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-deep disabled:opacity-50"
          >
            {MODES[mode].short}
          </button>
        ))}
      </div>
    </>
  );
}
