"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      await signIn("resend", {
        email,
        redirectTo: window.location.pathname,
      });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]"
      />
      <div className="panel relative w-full max-w-sm p-8 shadow-2xl shadow-black/50">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 font-bold text-black">
            S
          </span>
          <span className="text-sm font-semibold">
            Shelvr <span className="font-normal text-muted">Review</span>
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">
          Invite only. Sign in with the email your invite went to.
        </p>
        {state === "sent" ? (
          <p className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoFocus
              disabled={state === "sending"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field py-2.5"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="btn-primary w-full py-2.5"
            >
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {state === "error" && (
              <p className="text-sm text-rose-300">
                That didn&apos;t work. Check the address and try again.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
