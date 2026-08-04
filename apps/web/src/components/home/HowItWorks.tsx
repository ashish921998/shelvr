import { StepPhones } from "./PhoneMockups";

const steps = [
  {
    n: "01",
    title: "Save anything",
    body: "Paste a link, jot a note, or stash an image. Shelvr stores it immediately.",
  },
  {
    n: "02",
    title: "AI classifies it",
    body: "We extract the page, then propose a title, description, tags, and spaces.",
  },
  {
    n: "03",
    title: "Find it later",
    body: "Browse your feed, open a space, or search. Everything is already labeled.",
  },
];

const HowItWorks = () => {
  return (
    <section id="how" className="py-20 sm:py-28">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <p className="section-kicker">How it works</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-5xl tracking-[-0.03em] text-ink leading-[1.08] font-medium">
            From chaotic tab to clean shelf in seconds
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
            No folders to maintain. No tagging ritual. Save first — organization
            arrives on its own.
          </p>
        </div>

        <StepPhones />

        <ol className="mt-14 grid md:grid-cols-3 gap-5">
          {steps.map((step) => (
            <li key={step.n} className="soft-card rounded-3xl p-6 sm:p-7">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white text-xs font-bold">
                {step.n}
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm sm:text-base leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorks;
