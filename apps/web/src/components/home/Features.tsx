const features = [
  {
    title: "Capture anything",
    description:
      "Links, notes, and images land in one calm shelf instead of rotting in tabs and camera rolls.",
    tone: "bg-peach",
  },
  {
    title: "AI does the filing",
    description:
      "Every save gets a title, description, tags, and space suggestions — without a folder taxonomy project.",
    tone: "bg-mint",
  },
  {
    title: "Spaces that pull history",
    description:
      "Create “Design systems” and Shelvr reaches back through existing saves to fill it automatically.",
    tone: "bg-sky",
  },
  {
    title: "Search that works",
    description:
      "Full-text search across titles, notes, tags, and extracted article text. Future-you will thank present-you.",
    tone: "bg-paper-deep",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-20 sm:py-24 bg-cream border-y border-line">
      <div className="container">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12 lg:gap-16 items-start">
          <div className="max-w-md">
            <p className="section-kicker">Features</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-5xl tracking-[-0.03em] text-ink leading-[1.08] font-medium">
              Built for the “I’ll read this later” pile
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
              Bookmarks rot. Screenshots vanish. Tabs multiply. Shelvr turns
              that mess into a quiet, searchable library.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature) => (
              <article
                key={feature.title}
                className={`rounded-3xl border border-line ${feature.tone} p-6 sm:p-7`}
              >
                <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-muted">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
