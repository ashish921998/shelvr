import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/common/Logo";

export const metadata: Metadata = {
  title: "Terms of Service — Shelvr",
  description: "The terms that govern your use of Shelvr.",
};

export default function TermsPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-3xl py-10 sm:py-16">
        <Link href="/">
          <Logo />
        </Link>

        <h1 className="mt-10 font-display text-3xl sm:text-4xl text-ink">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: August 6, 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-ink/90">
          <section>
            <h2 className="font-semibold text-ink text-lg">1. The service</h2>
            <p className="mt-2">
              Shelvr lets you save links, images, and notes and organizes them
              into spaces. By creating an account or using the app you agree to
              these terms.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">2. Your account</h2>
            <p className="mt-2">
              You must provide accurate information and keep your account
              secure. You are responsible for activity under your account. You
              must be at least 13 years old to use Shelvr.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">3. Your content</h2>
            <p className="mt-2">
              You own what you save. You grant us the limited license needed to
              store, process, and display your content back to you — including
              automated AI processing that titles, tags, and organizes it. We
              claim no other rights to it. Don&rsquo;t save content that is
              unlawful or that you have no right to store.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">
              4. Subscriptions
            </h2>
            <p className="mt-2">
              Shelvr Pro is an auto-renewing subscription purchased through the
              App Store. Plans may include a free trial; you can cancel anytime
              in your App Store subscription settings, and cancelling before
              the trial ends means you won&rsquo;t be charged. Prices are shown
              before purchase and may change with notice. Refunds are handled
              by Apple under App Store policies.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">
              5. Acceptable use
            </h2>
            <p className="mt-2">
              Don&rsquo;t abuse the service: no attempts to breach security,
              scrape other users&rsquo; data, reverse engineer the app beyond
              what the law permits, or use Shelvr to store or distribute
              unlawful material.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">6. Termination</h2>
            <p className="mt-2">
              You can stop using Shelvr and request account deletion at any
              time. We may suspend or terminate accounts that violate these
              terms.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">7. Disclaimers</h2>
            <p className="mt-2">
              Shelvr is provided &ldquo;as is.&rdquo; AI-generated titles,
              tags, and classifications can be wrong. To the maximum extent
              permitted by law, we disclaim warranties and limit our liability
              to the amount you paid us in the twelve months before a claim.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">8. Changes</h2>
            <p className="mt-2">
              We may update these terms; material changes will be posted on
              this page with an updated date. Continuing to use Shelvr after
              changes take effect means you accept them.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">9. Contact</h2>
            <p className="mt-2">
              Questions: <strong>support@shelvr.app</strong>
            </p>
          </section>
        </div>

        <p className="mt-12 pt-6 border-t border-line text-sm text-muted">
          © {new Date().getFullYear()} Shelvr. All rights reserved. ·{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy Policy
          </Link>
        </p>
      </div>
    </main>
  );
}
