import type { Metadata } from "next";

import Logo from "@/components/common/Logo";

export const metadata: Metadata = {
  title: "Return to Shelvr",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function AuthCallbackPage() {
  return (
    <main className="bg-paper min-h-screen">
      <div className="container max-w-2xl py-10 sm:py-16">
        <Logo />

        <h1 className="font-display mt-10 text-3xl text-balance text-ink sm:text-4xl">
          Return to Shelvr
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-ink/90">
          If the app did not open, return to Shelvr and retry sign-in.
        </p>
      </div>
    </main>
  );
}
