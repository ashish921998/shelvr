import Link from "next/link";
import { HeroPhones } from "./PhoneMockups";

const Hero = () => {
  return (
    <section className="relative overflow-hidden pt-16 pb-10 sm:pt-24 sm:pb-14">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgba(228,87,46,0.08),transparent_55%)]" />
      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-medium text-muted shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Save once. Find it on the shelf later.
          </div>

          <h1 className="mt-7 font-[family-name:var(--font-display)] text-[2.85rem] sm:text-6xl lg:text-[4.6rem] leading-[1.02] tracking-[-0.035em] text-ink font-medium">
            Your internet,
            <br className="hidden sm:block" /> shelved for later.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-muted">
            Capture links, notes, and images in one tap. Shelvr titles, tags,
            and files each save into spaces so future-you can actually find it.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="#get-app"
              className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-3.5 text-sm sm:text-base font-semibold text-white hover:bg-ink-soft transition-colors"
            >
              Get the iOS app
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center justify-center rounded-full border border-line-strong bg-cream px-6 py-3.5 text-sm sm:text-base font-medium text-ink-soft hover:border-ink/25 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </div>

        <HeroPhones />
      </div>
    </section>
  );
};

export default Hero;
