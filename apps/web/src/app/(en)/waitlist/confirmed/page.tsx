import Link from "next/link";

import Logo from "@/components/common/Logo";

export default function ConfirmedPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-2xl py-10 sm:py-16">
        <Logo />

        <h1 className="font-display mt-10 text-3xl text-balance text-ink sm:text-4xl">
          Your waitlist request is confirmed.
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink/90">
          We’ll email you when Shelvr launches.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-full bg-ink px-6 py-3 font-semibold text-paper transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back to Shelvr
        </Link>
      </div>
    </main>
  );
}
