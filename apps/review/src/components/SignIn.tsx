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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="mb-6 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-pink-500 font-bold text-black">
          S
        </div>
        <h1 className="text-xl font-semibold">Shelvr Review</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Invite only. Sign in with the email your invite went to.
        </p>
        {state === "sent" ? (
          <p className="mt-6 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Check {email} for a sign-in link.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 outline-none focus:border-orange-400"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="w-full rounded-lg bg-white py-2 font-medium text-black disabled:opacity-60"
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
