"use client";

import { FormEvent, useState } from "react";
import { captureWebAnalyticsEvent } from "@/lib/analytics";

type AndroidWaitlistProps = {
  source: "hero" | "footer";
};

export default function AndroidWaitlist({ source }: AndroidWaitlistProps) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const panelId = `android-waitlist-${source}`;

  function reveal() {
    setExpanded(true);
    captureWebAnalyticsEvent("android_waitlist_opened", { source });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("loading");
    setMessage("");
    captureWebAnalyticsEvent("android_waitlist_submitted", { source });

    try {
      const response = await fetch("/api/android-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          company: data.get("company"),
          source,
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Could not join right now.");
      }

      setStatus("success");
      setMessage("You’re on the Android list. We’ll email you at launch.");
      form.reset();
      captureWebAnalyticsEvent("android_waitlist_joined", { source });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not join right now.",
      );
      captureWebAnalyticsEvent("android_waitlist_signup_failed", { source });
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        aria-expanded="false"
        aria-controls={panelId}
        onClick={reveal}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-muted underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-deep"
      >
        On Android? Join the waitlist →
      </button>
    );
  }

  return (
    <div id={panelId} className="mt-4 w-full max-w-md" aria-live="polite">
      {status === "success" ? (
        <p
          role="status"
          className="rounded-xl border border-shelf/20 bg-ember-soft px-4 py-3 text-sm font-medium text-shelf"
        >
          {message}
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor={`${panelId}-email`} className="sr-only">
            Email address for the Android waitlist
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`${panelId}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-4 text-base text-ink outline-none transition placeholder:text-muted-soft focus:border-ember-deep focus:ring-2 focus:ring-ember/25"
            />
            <input
              name="company"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="min-h-12 shrink-0 rounded-xl bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60"
            >
              {status === "loading" ? "Joining…" : "Notify me"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            One Android launch email. No newsletter, no noise.
          </p>
          {status === "error" ? (
            <p
              role="alert"
              className="mt-2 text-sm font-medium text-ember-deep"
            >
              {message}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
