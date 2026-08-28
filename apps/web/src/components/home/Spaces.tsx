import AppPhone from "./AppPhone";

export default function Spaces() {
  return (
    <section id="spaces" className="border-t border-line py-20 sm:py-28">
      <div className="container grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="relative mx-auto flex h-[37rem] w-full max-w-xl items-center justify-center">
          <AppPhone
            src="/images/app/home.webp"
            alt="Shelvr visual home feed"
            className="absolute h-[34rem] w-[16.25rem] -translate-x-12 rotate-[-5deg] sm:-translate-x-20"
          />
          <AppPhone
            src="/images/app/spaces.webp"
            alt="Shelvr spaces screen with visual collections"
            className="absolute h-[35rem] w-[16.5rem] translate-x-12 rotate-[4deg] sm:translate-x-20"
          />
        </div>

        <div className="text-center lg:text-left">
          <p className="section-kicker justify-center lg:justify-start">
            Living collections
          </p>
          <h2 className="mt-4 text-5xl font-bold leading-[0.96] tracking-[-0.06em] text-ink sm:text-6xl">
            Spaces fill themselves.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted sm:text-lg">
            Create a space like Recipes, Gift ideas, or Trips. Shelvr reaches
            back through your library, finds what belongs, and keeps adding
            matching saves over time.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {["Retroactive", "Automatic", "Always editable"].map((item) => (
              <span
                key={item}
                className="rounded-full bg-ember-soft px-3 py-2 text-xs font-bold text-ember-deep"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
