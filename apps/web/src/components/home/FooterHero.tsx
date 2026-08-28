import WaitlistForm from "./WaitlistForm";

export default function FooterHero() {
  return (
    <section id="get-app" className="px-4 pb-20 pt-8 sm:pb-24">
      <div className="container relative overflow-hidden rounded-[2rem] border border-[#ead7b5] bg-ember-soft px-6 py-20 text-center sm:px-12 sm:py-24">
        <span
          aria-hidden
          className="display pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12rem] text-ember-deep/[0.05] sm:text-[17rem]"
        >
          shelvr
        </span>
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-5xl font-bold leading-[0.94] tracking-[-0.06em] text-ink sm:text-7xl">
            A quieter place for
            <br />
            <em className="display text-ember-deep">everything interesting.</em>
          </h2>
          <p className="mt-5 text-base text-muted sm:text-lg">
            Launching first on iOS. One email when access opens.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <WaitlistForm source="footer" />
          </div>
        </div>
      </div>
    </section>
  );
}
