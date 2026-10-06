import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/home/Footer";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-paper min-h-screen">
      <Header />
      <main className="container max-w-3xl py-10 sm:py-16">
        <h1 className="font-display text-3xl sm:text-4xl text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {lastUpdated}</p>

        <div className="mt-8 space-y-8 text-[15px] leading-7 text-ink/90">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
