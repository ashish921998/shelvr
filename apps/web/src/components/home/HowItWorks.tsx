import AppPhone from "./AppPhone";

const steps = [
  {
    number: "01 / CAPTURE",
    title: "Save from anywhere",
    body: "The share sheet, a note, your camera roll, or the camera—without leaving your train of thought.",
    image: "/images/app/save.webp",
    alt: "Shelvr save sheet with note, article, photo, and camera options",
  },
  {
    number: "02 / UNDERSTAND",
    title: "AI adds the context",
    body: "A useful title, a short summary, tags, and the right spaces appear automatically.",
    image: "/images/app/detail.webp",
    alt: "Shelvr detail screen with AI-generated summary, tags, and spaces",
  },
  {
    number: "03 / RECALL",
    title: "Find it your way",
    body: "Browse your visual shelf or search the fragment you remember across every saved item.",
    image: "/images/app/search.webp",
    alt: "Shelvr search results for saved travel items",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-20 sm:py-28">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <p className="section-kicker justify-center">The Shelvr loop</p>
          <h2 className="mt-4 text-4xl font-bold leading-[0.98] tracking-[-0.06em] text-ink sm:text-6xl lg:text-7xl">
            From “save this” to
            <br /> “there it is.”
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Three small moments, one continuous app experience. Capture what
            matters, let Shelvr understand it, then find it the way you
            remember it.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.number}
              className={`flex min-h-[43rem] flex-col overflow-hidden rounded-[1.75rem] border border-line p-6 pb-0 sm:p-7 sm:pb-0 ${
                index === 1 ? "bg-ember-soft" : "bg-cream"
              }`}
            >
              <span className="text-[0.65rem] font-bold tracking-[0.14em] text-ember-deep">
                {step.number}
              </span>
              <h3 className="mt-3 text-2xl font-bold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
              <AppPhone
                src={step.image}
                alt={step.alt}
                className={`mx-auto mt-7 h-[32rem] w-[15.25rem] translate-y-4 ${
                  index === 1 ? "rotate-2 lg:translate-y-9" : ""
                } ${index === 2 ? "-rotate-2 lg:translate-y-7" : ""}`}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
