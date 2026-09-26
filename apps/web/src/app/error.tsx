"use client";

import { useEffect } from "react";

import { captureWebException } from "@/lib/analytics";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureWebException(error, { boundary: "route" });
  }, [error]);

  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-3xl py-10 sm:py-16">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink/90">
          The page hit an unexpected error. You can try again, or email
          ashish921998@zohomail.in if it keeps happening.
        </p>
        <button
          className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-80"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
