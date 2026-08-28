"use client";

import { FormEvent, useState } from "react";
import { capture } from "@/lib/analytics";

type WaitlistFormProps = {
  source: "hero" | "preview" | "footer";
  variant?: "waitlist" | "preview";
  dark?: boolean;
  compact?: boolean;
  accent?: boolean;
};

export default function WaitlistForm({
  source,
  variant = "waitlist",
  dark = false,
  compact = false,
  accent = false,
}: WaitlistFormProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("loading");
    setMessage("");
    capture("waitlist_form_submitted", { source, variant });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          company: data.get("company"),
          source,
          variant,
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok)
        throw new Error(result.message ?? "Could not join right now.");

      setStatus("success");
      setMessage("You’re on the shelf. We’ll email you when iOS is ready.");
      form.reset();
      capture("waitlist_joined", { source, variant });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not join right now.",
      );
      capture("waitlist_signup_failed", { source, variant });
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className={`rounded-2xl border px-5 py-4 text-sm font-medium ${
          dark
            ? "border-white/20 bg-white/10 text-white"
            : "border-shelf/20 bg-mint text-shelf"
        }`}
      >
        {message}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={compact ? "w-full" : "mx-auto w-full max-w-xl"}
    >
      <label htmlFor={`waitlist-email-${source}`} className="sr-only">
        Email address
      </label>
      <div
        className={`flex flex-col gap-2 sm:flex-row sm:rounded-2xl sm:border sm:p-1.5 ${
          dark
            ? "sm:border-white/20 sm:bg-white/10"
            : "sm:border-line-strong sm:bg-white"
        }`}
      >
        <input
          id={`waitlist-email-${source}`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className={`min-h-12 min-w-0 flex-1 rounded-xl border px-5 text-base outline-none transition sm:border-0 sm:bg-transparent ${
            dark
              ? "border-white/20 bg-white/10 text-white placeholder:text-white/50 focus:border-white/50"
              : "border-line-strong bg-white text-ink placeholder:text-muted-soft focus:border-ink/40"
          }`}
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
          className={`min-h-12 shrink-0 rounded-xl px-6 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
            dark
              ? "bg-white text-ink hover:bg-paper-deep"
              : accent
                ? "bg-ember text-ink hover:bg-[#d89531]"
                : "bg-ink text-white hover:bg-ink-soft"
          }`}
        >
          {status === "loading" ? "Joining…" : "Notify me at launch"}
        </button>
      </div>
      <p className={`mt-2.5 text-xs ${dark ? "text-white/55" : "text-muted"}`}>
        One launch email. No newsletter, no noise.
      </p>
      {status === "error" ? (
        <p role="alert" className="mt-2 text-sm font-medium text-ember-deep">
          {message}
        </p>
      ) : null}
    </form>
  );
}
