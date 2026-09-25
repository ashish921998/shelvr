import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/common/Logo";

export function LegalPage({
  title,
  lastUpdated,
  children,
  footerHref,
  footerLabel,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
  footerHref: "/privacy" | "/terms";
  footerLabel: string;
}) {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-3xl py-10 sm:py-16">
        <Logo />

        <h1 className="mt-10 font-display text-3xl sm:text-4xl text-ink">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted">Last updated: {lastUpdated}</p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-ink/90">
          {children}
        </div>

        <p className="mt-12 pt-6 border-t border-line text-sm text-muted">
          © {new Date().getFullYear()} Shelvr. All rights reserved. ·{" "}
          <Link href={footerHref} className="underline hover:text-ink">
            {footerLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
