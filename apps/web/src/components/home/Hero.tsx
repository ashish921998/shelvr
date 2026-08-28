import Link from "next/link";
import AppPhone from "./AppPhone";
import WaitlistForm from "./WaitlistForm";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container grid min-h-[52rem] items-center gap-12 py-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:py-16">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ead4ad] bg-[#fff8eb] px-3 py-2 text-xs font-semibold text-ember-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Private beta opening soon
          </span>

          <h1 className="mt-7 text-[3.25rem] font-bold leading-[0.92] tracking-[-0.07em] text-ink sm:text-7xl lg:text-[6.1rem]">
            Your saved internet,
            <em className="display block text-ember-deep">finally useful.</em>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Shelvr is a calm, searchable home for everything you want to
            remember. Save in one tap. Let AI handle the filing.
          </p>

          <div className="mt-8 w-full max-w-xl">
            <WaitlistForm source="hero" compact accent />
            <Link
              href="#how"
              className="mt-2 inline-flex min-h-10 items-center justify-center text-sm font-bold text-ink underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep lg:justify-start"
            >
              See how it works&nbsp; ↓
            </Link>
          </div>

          <div className="mt-9 grid gap-2 text-xs text-muted sm:flex sm:gap-5">
            {["Built for iPhone", "Private by design", "No folder upkeep"].map(
              (item) => (
                <span key={item}>
                  <span className="mr-2 text-ember-deep">✓</span>
                  {item}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="relative mx-auto grid h-[40rem] w-full max-w-[38rem] place-items-center sm:h-[45rem]">
          <div className="absolute h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(230,162,60,0.18),transparent_68%)] sm:h-[38rem] sm:w-[38rem]" />
          <span className="display absolute right-2 top-8 hidden rotate-3 text-lg text-muted lg:block">
            the app, for real →
          </span>

          <AppPhone
            src="/images/app/home.webp"
            alt="Shelvr home screen showing a visual feed of saved links and images"
            priority
            className="z-10 h-[38rem] w-[18.25rem] sm:h-[43rem] sm:w-[20.6rem]"
          />

          <div className="absolute left-0 top-36 z-20 rounded-2xl border border-line bg-cream/95 px-4 py-3 text-xs font-bold shadow-card backdrop-blur sm:left-3">
            <span className="text-ember-deep">One tap saved</span>
            <small className="mt-1 block font-normal text-muted">
              link, note, photo, or camera
            </small>
          </div>
          <div className="absolute bottom-20 right-0 z-20 rounded-2xl border border-line bg-cream/95 px-4 py-3 text-xs font-bold shadow-card backdrop-blur">
            <span className="text-ember-deep">Already organized</span>
            <small className="mt-1 block font-normal text-muted">
              titles, tags, and spaces
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}
