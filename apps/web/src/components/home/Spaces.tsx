const spaces = [
  {
    name: "Design systems",
    count: 48,
    color: "#E4572E",
    blurb: "Component APIs, tokens, critique threads.",
  },
  {
    name: "Weekend cooking",
    count: 23,
    color: "#0F766E",
    blurb: "Recipes, techniques, market lists.",
  },
  {
    name: "Travel rabbit holes",
    count: 31,
    color: "#0B1128",
    blurb: "Neighborhoods, photo spots, packing notes.",
  },
];

const Spaces = () => {
  return (
    <section id="spaces" className="py-20 sm:py-28">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <p className="section-kicker">Spaces</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl sm:text-5xl tracking-[-0.03em] text-ink leading-[1.08] font-medium">
              Themed shelves that fill themselves
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted leading-relaxed">
              Spaces are living collections. When you create one, Shelvr
              re-reads your library and pulls in matching saves — past and
              future.
            </p>
            <ul className="mt-8 space-y-3 text-sm sm:text-base text-ink-soft">
              {[
                "Create a space in seconds",
                "Matching history fills in automatically",
                "Manual add or remove whenever you want control",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-shelf shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4">
            {spaces.map((space, i) => (
              <div
                key={space.name}
                className="soft-card rounded-[1.4rem] p-5 sm:p-6 flex items-center gap-4"
                style={{ transform: i === 1 ? "translateX(12px)" : undefined }}
              >
                <div
                  className="h-14 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: space.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">{space.name}</h3>
                    <span className="text-xs font-medium text-muted whitespace-nowrap">
                      {space.count} items
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{space.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Spaces;
