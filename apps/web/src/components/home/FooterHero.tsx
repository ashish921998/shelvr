import Link from "next/link";

const FooterHero = () => {
  return (
    <section id="get-app" className="py-16 sm:py-20">
      <div className="container">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink text-white px-6 py-14 sm:px-12 sm:py-16 text-center">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-ember/30 blur-3xl" />
          <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-shelf/25 blur-3xl" />

          <div className="relative mx-auto max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#F0B59A]">
              Mobile-first
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-5xl tracking-[-0.03em] leading-[1.08] font-medium">
              Put the internet back on a shelf
            </h2>
            <p className="mt-4 text-base sm:text-lg text-white/70 leading-relaxed">
              Shelvr lives on your phone. Capture the next thing you care about
              before the tab disappears forever.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm sm:text-base font-semibold text-ink">
                iOS app coming soon
              </span>
              <Link
                href="#how"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-sm sm:text-base font-medium text-white/90 hover:border-white/40 transition-colors"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FooterHero;
