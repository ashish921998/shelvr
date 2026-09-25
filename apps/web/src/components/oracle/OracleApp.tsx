"use client";

import { type ComponentType, useEffect, useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { useAppStoreLink } from "@/lib/appStoreLink";
import type {
  OracleInput,
  OracleInputProps,
  OracleMode,
  OracleVerdict,
} from "@/lib/oracle";

import LibraryInput from "./LibraryInput";
import LinksInput from "./LinksInput";
import ScreenshotInput from "./ScreenshotInput";
import ShareRow from "./ShareRow";
import TabsInput from "./TabsInput";
import VerdictCard from "./VerdictCard";

const MODES: Record<
  OracleMode,
  { name: string; hook: string; Input: ComponentType<OracleInputProps> }
> = {
  links: {
    name: "Saver Oracle",
    hook: "Paste 3 links you saved. I’ll guess why.",
    Input: LinksInput,
  },
  screenshot: {
    name: "Screenshot Confession",
    hook: "One screenshot from your camera roll. I’ll guess what it was for.",
    Input: ScreenshotInput,
  },
  tabs: {
    name: "Tab Roast",
    hook: "How many tabs are open right now? Be honest.",
    Input: TabsInput,
  },
  library: {
    name: "Saved-but-never-opened report",
    hook: "Paste your bookmarks export. Get the damage report.",
    Input: LibraryInput,
  },
};

type OracleState =
  | { phase: "picking" }
  | { phase: "asking"; mode: OracleMode; error?: string }
  | { phase: "consulting"; mode: OracleMode }
  | {
      phase: "answered";
      mode: OracleMode;
      input: OracleInput;
      verdict: OracleVerdict;
    };

function isOracleMode(value: string | null): value is OracleMode {
  return value !== null && Object.hasOwn(MODES, value);
}

function StoreCta() {
  const { href, onClick } = useAppStoreLink("oracle");
  return (
    <div className="mt-8 rounded-3xl bg-ink px-6 py-7 text-center text-white sm:px-8">
      <p className="display text-2xl sm:text-3xl">
        Shelvr already sorted these. Keep them.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-ember px-6 text-base font-bold text-ink transition hover:-translate-y-0.5 hover:bg-ember-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Get Shelvr, free
      </a>
    </div>
  );
}

export default function OracleApp() {
  const [state, setState] = useState<OracleState>({ phase: "picking" });

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
        captureWebAnalyticsEvent("oracle_verdict", {
          mode,
          persona: verdict.persona,
        });
        setState({ phase: "answered", mode, input, verdict });
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
        Show me three things you saved and I’ll tell you who you are.
      </h1>

      {state.phase === "picking" && (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {(Object.keys(MODES) as OracleMode[]).map((mode) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => setState({ phase: "asking", mode })}
                className="soft-card flex h-full min-h-28 w-full flex-col items-start rounded-2xl p-5 text-left transition hover:-translate-y-0.5 hover:border-ember focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-deep"
              >
                <span className="text-lg font-bold text-ink">
                  {MODES[mode].name}
                </span>
                <span className="mt-1 text-[15px] leading-6 text-muted">
                  {MODES[mode].hook}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(state.phase === "asking" || state.phase === "consulting") && (
        <ModePanel
          state={state}
          onBack={() => setState({ phase: "picking" })}
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
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ShareRow mode={state.mode} persona={state.verdict.persona} />
            <button
              type="button"
              onClick={() => setState({ phase: "picking" })}
              className="min-h-12 rounded-xl px-5 text-base font-semibold text-muted underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep"
            >
              Ask the oracle again
            </button>
          </div>
          <StoreCta />
        </section>
      )}
    </div>
  );
}

function ModePanel({
  state,
  onBack,
  onSubmit,
}: {
  state: Extract<OracleState, { phase: "asking" | "consulting" }>;
  onBack: () => void;
  onSubmit: (input: OracleInput) => void;
}) {
  const { name, hook, Input } = MODES[state.mode];
  const busy = state.phase === "consulting";
  return (
    <section className="soft-card mt-8 rounded-3xl p-5 sm:p-8">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-muted transition hover:text-ink disabled:opacity-50"
      >
        ← Pick another
      </button>
      <h2 className="mt-2 text-2xl font-bold text-ink">{name}</h2>
      <p className="mt-1 text-base text-muted">{hook}</p>
      <div className="mt-5">
        <Input busy={busy} onSubmit={onSubmit} />
      </div>
      {state.phase === "asking" && state.error && (
        <p role="alert" className="mt-4 text-sm font-medium text-ember-deep">
          {state.error}
        </p>
      )}
    </section>
  );
}
