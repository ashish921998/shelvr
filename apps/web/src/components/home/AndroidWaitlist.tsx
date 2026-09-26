"use client";

import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { FormEvent, useState } from "react";
import { captureWebAnalyticsEvent } from "@/lib/analytics";

type AndroidWaitlistProps = {
  source: "hero" | "footer";
};

export default function AndroidWaitlist({ source }: AndroidWaitlistProps) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const inputId = `android-waitlist-${source}-email`;

  // The form is always visible now, so "opened" means the first focus.
  function open() {
    if (opened) return;
    setOpened(true);
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
      captureWebAnalyticsEvent("android_waitlist_joined", { source });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not join right now.",
      );
      captureWebAnalyticsEvent("android_waitlist_signup_failed", { source });
    }
  }

  return (
    <div
      id="android"
      className="relative flex w-full max-w-[440px] scroll-mt-24 flex-col items-center gap-2.5 mt-2"
      aria-live="polite"
    >
      <label
        htmlFor={inputId}
        className="text-[13px] font-medium text-dark-muted"
      >
        On Android? Leave your email and we’ll tell you the day it lands.
      </label>
      {status === "success" ? (
        <p
          role="status"
          className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-dark-plank-2 bg-dark-3 px-4 text-[15px] font-bold text-ember-light"
        >
          <CheckCircleIcon aria-hidden className="size-[18px]" />
          You’re on the list.
        </p>
      ) : (
        <form onSubmit={submit} className="flex w-full gap-2">
          <input
            id={inputId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            onFocus={open}
            placeholder="you@example.com"
            className="h-11 min-w-0 flex-1 rounded-[11px] border border-dark-plank-2 bg-dark-2 px-3.5 text-[15px] font-medium text-dark-text outline-none placeholder:text-dark-muted focus:border-ember"
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
            className="h-11 shrink-0 rounded-[11px] border border-dark-plank-2 px-[18px] text-[15px] font-bold whitespace-nowrap text-dark-text transition-colors hover:bg-dark-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:cursor-wait disabled:opacity-60"
          >
            {status === "loading" ? "Joining…" : "Join waitlist"}
          </button>
        </form>
      )}
      {status === "error" ? (
        <p role="alert" className="text-sm font-medium text-ember-light">
          {message}
        </p>
      ) : null}
    </div>
  );
}
