"use client";

import { useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import type { OracleMode } from "@/lib/oracle";

export default function ShareRow({
  mode,
  persona,
}: {
  mode: OracleMode;
  persona: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const text = `The Shelvr Oracle says I'm ${persona}. What are you?`;
    const url = `${window.location.origin}/oracle?mode=${mode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "The Shelvr Oracle", text, url });
        captureWebAnalyticsEvent("oracle_shared", {
          mode,
          method: "web_share",
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      captureWebAnalyticsEvent("oracle_shared", { mode, method: "clipboard" });
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="min-h-12 w-full rounded-xl border border-line-strong bg-white px-5 text-base font-semibold text-ink transition hover:border-ember-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto"
    >
      <span aria-live="polite">
        {copied ? "Copied. Go on, post it." : "Share my verdict"}
      </span>
    </button>
  );
}
