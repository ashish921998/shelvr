"use client";

import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { FormEvent, useState } from "react";
import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { arrivalCampaign } from "@/lib/appStore";

const inputId = "android-waitlist-email";

const tones = {
  dark: {
    label: "text-dark-muted",
    input:
      "border-dark-plank-2 bg-dark-2 text-dark-text placeholder:text-dark-muted",
    button: "border-dark-plank-2 text-dark-text hover:bg-dark-3",
    done: "border-dark-plank-2 bg-dark-3 text-ember-light",
    error: "text-ember-light",
  },
  light: {
    label: "text-muted",
    input: "border-line-strong bg-cream text-ink placeholder:text-muted-soft",
    button: "border-line-strong text-ink hover:bg-paper-deep",
    done: "border-line bg-paper-deep text-ember-deep",
    error: "text-terracotta",
  },
};

type AndroidWaitlistProps = {
  source?: "footer" | "plan" | "bio";
  tone?: keyof typeof tones;
};

export default function AndroidWaitlist({
  source = "footer",
  tone = "dark",
}: AndroidWaitlistProps) {
  const classes = tones[tone];
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  function track(event: string) {
    const campaign = arrivalCampaign(window.location.search);
    captureWebAnalyticsEvent(event, {
      source,
      ...(campaign ? { campaign } : {}),
    });
  }

  function open() {
    if (opened) return;
    setOpened(true);
    track("android_waitlist_opened");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("loading");
    setMessage("");
    track("android_waitlist_submitted");

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
      const result = (await response.json()) as {
        message?: string;
        confirmationSent?: boolean;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Could not join right now.");
      }

      setMessage(
        result.confirmationSent
          ? "Check your inbox to confirm."
          : "You’re on the list.",
      );
      setStatus("success");
      track("android_waitlist_joined");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not join right now.",
      );
      track("android_waitlist_signup_failed");
    }
  }

  return (
    <div
      id="android"
      className="relative flex w-full max-w-[440px] scroll-mt-24 flex-col items-center gap-2.5 mt-2"
    >
      <label
        htmlFor={inputId}
        className={`text-[13px] font-medium ${classes.label}`}
      >
        On Android? Leave your email and we’ll tell you the day it lands.
      </label>
      {status === "success" ? null : (
        <form
          onSubmit={submit}
          className="flex w-full flex-col gap-2 min-[360px]:flex-row"
        >
          <input
            id={inputId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            onFocus={open}
            placeholder="you@example.com"
            className={`h-11 min-w-0 flex-1 rounded-[11px] border px-3.5 text-[15px] font-medium outline-none focus:border-ember ${classes.input}`}
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
            className={`h-11 w-full shrink-0 rounded-[11px] border px-[18px] min-[360px]:w-auto text-[15px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember disabled:cursor-wait disabled:opacity-60 ${classes.button}`}
          >
            {status === "loading" ? "Joining…" : "Join waitlist"}
          </button>
        </form>
      )}
      <div role="status">
        {status === "success" ? (
          <p
            className={`inline-flex h-11 items-center gap-2 rounded-[11px] border px-4 text-[15px] font-bold ${classes.done}`}
          >
            <CheckCircleIcon aria-hidden className="size-[18px]" />
            {message}
          </p>
        ) : null}
      </div>
      {status === "error" ? (
        <p role="alert" className={`text-sm font-medium ${classes.error}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
