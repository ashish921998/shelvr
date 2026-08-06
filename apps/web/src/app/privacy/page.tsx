import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/common/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy — Shelvr",
  description: "How Shelvr collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-3xl py-10 sm:py-16">
        <Link href="/">
          <Logo />
        </Link>

        <h1 className="mt-10 font-display text-3xl sm:text-4xl text-ink">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: August 6, 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-ink/90">
          <section>
            <h2 className="font-semibold text-ink text-lg">What Shelvr is</h2>
            <p className="mt-2">
              Shelvr is a save-it-for-later app: you capture links, images, and
              notes, and Shelvr organizes them into spaces so you can find them
              again. This policy explains what data we collect to make that
              work, and what we do with it.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">Data we collect</h2>
            <ul className="mt-2 list-disc pl-5 space-y-2">
              <li>
                <strong>Account information.</strong> When you sign up we
                collect your email address (and your name, if your sign-in
                provider shares it). Authentication is handled by Clerk.
              </li>
              <li>
                <strong>Content you save.</strong> The links, notes, and images
                you save are stored on our backend (Convex) so they sync to
                your devices. Images are only imported when you actively pick
                them from your camera or photo library.
              </li>
              <li>
                <strong>Purchase information.</strong> If you subscribe to
                Shelvr Pro, our payments partner RevenueCat processes your
                purchase together with the App Store. We receive your
                subscription status, not your payment details.
              </li>
            </ul>
            <p className="mt-3">
              We do not collect your location, contacts, browsing history, or
              advertising identifiers, and we do not run third-party
              advertising or tracking SDKs.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">
              How your content is processed
            </h2>
            <p className="mt-2">
              To organize your saves, Shelvr sends the content of an item (for
              example a page&rsquo;s text or your note) to a large language
              model to generate a title, description, and tags. This processing
              is automated, used only to organize your library, and is never
              used to train models or shared for advertising.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">
              Sharing and selling
            </h2>
            <p className="mt-2">
              We never sell your data. We share it only with the service
              providers named above (Clerk, Convex, RevenueCat, and our AI
              processing provider), strictly to operate Shelvr, and where
              required by law.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">
              Retention and deletion
            </h2>
            <p className="mt-2">
              Your content stays in your account until you delete it. Deleting
              an item removes it from our backend. If you want your entire
              account and all associated data deleted, contact us and we will
              complete the deletion within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">Your rights</h2>
            <p className="mt-2">
              Depending on where you live, you may have rights to access,
              correct, export, or delete your personal data. Contact us and we
              will honor them.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">Children</h2>
            <p className="mt-2">
              Shelvr is not directed at children under 13, and we do not
              knowingly collect data from them.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">Changes</h2>
            <p className="mt-2">
              If we make material changes to this policy, we will update this
              page and the date above.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg">Contact</h2>
            <p className="mt-2">
              Questions or requests: <strong>support@shelvr.app</strong>
            </p>
          </section>
        </div>

        <p className="mt-12 pt-6 border-t border-line text-sm text-muted">
          © {new Date().getFullYear()} Shelvr. All rights reserved. ·{" "}
          <Link href="/terms" className="underline hover:text-ink">
            Terms of Service
          </Link>
        </p>
      </div>
    </main>
  );
}
