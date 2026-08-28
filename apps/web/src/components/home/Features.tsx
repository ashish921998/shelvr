import AppPhone from "./AppPhone";

export default function Features() {
  return (
    <section id="search" className="border-t border-line py-20 sm:py-28">
      <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="text-center lg:text-left">
          <p className="section-kicker justify-center lg:justify-start">
            More than bookmarks
          </p>
          <h2 className="mt-4 text-5xl font-bold leading-[0.96] tracking-[-0.06em] text-ink sm:text-6xl">
            Your saves become useful again.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Search full article text, revisit the AI summary, explore related
            saves, or see saved places on a map. Shelvr gives every save
            somewhere useful to go.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {["Full-text search", "Related saves", "Saved places", "Photo tidy"].map(
              (item) => (
                <span
                  key={item}
                  className="rounded-full bg-ember-soft px-3 py-2 text-xs font-bold text-ember-deep"
                >
                  {item}
                </span>
              ),
            )}
          </div>
        </div>

        {/* overflow-hidden keeps the rotated phones' corners from spilling
            past the viewport edge on narrow screens. */}
        <div className="relative mx-auto flex h-[37rem] w-full max-w-xl items-center justify-center overflow-hidden">
          <AppPhone
            src="/images/app/detail.webp"
            alt="Shelvr detail screen with summary, tags, and related saves"
            className="absolute h-[34rem] w-[16.25rem] -translate-x-12 rotate-[-5deg] sm:-translate-x-20"
          />
          <AppPhone
            src="/images/app/search.webp"
            alt="Shelvr full-text search screen"
            className="absolute h-[35rem] w-[16.5rem] translate-x-12 rotate-[4deg] sm:translate-x-20"
          />
        </div>
      </div>
    </section>
  );
}
