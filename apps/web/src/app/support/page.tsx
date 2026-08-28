import type { Metadata } from "next";
import Link from "next/link";

import Logo from "@/components/common/Logo";

export const metadata: Metadata = {
  title: "Support — Shelvr",
  description: "Get help with Shelvr, subscriptions, privacy, or your account.",
};

const SUPPORT_EMAIL = "support@shelvr.app";

export default function SupportPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-3xl py-10 sm:py-16">
        <Logo />

        <h1 className="mt-10 font-display text-3xl text-ink sm:text-4xl">
          Shelvr Support
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink/90">
          Need help with sign-in, saving, Shelvr Pro, privacy, or account
          deletion? Email us and include the device model, iOS version, and a
          short description of what happened.
        </p>

        <a
          className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-80"
          href={`mailto:${SUPPORT_EMAIL}?subject=Shelvr%20Support`}
        >
          Email {SUPPORT_EMAIL}
        </a>

        <div className="mt-10 space-y-6 text-[15px] leading-7 text-ink/90">
          <section>
            <h2 className="text-lg font-semibold text-ink">Subscriptions</h2>
            <p className="mt-2">
              Restore purchases or manage Shelvr Pro from Profile in the app.
              Billing and cancellations are handled by Apple through your Apple
              ID subscription settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">Account deletion</h2>
            <p className="mt-2">
              Open Profile and choose Delete account. This permanently removes
              your Shelvr account and saved content; it does not cancel an App
              Store subscription.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">Privacy requests</h2>
            <p className="mt-2">
              Email us to request access, correction, export, or deletion of
              personal data not covered by the in-app deletion flow.
            </p>
          </section>
        </div>

        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          <Link className="underline hover:text-ink" href="/privacy">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link className="underline hover:text-ink" href="/terms">
            Terms of Service
          </Link>
        </p>
      </div>
    </main>
  );
}
