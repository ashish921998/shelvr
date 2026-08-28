const stats = [
  { value: "1 tap", label: "to save anything" },
  { value: "0 upkeep", label: "AI handles the filing" },
  { value: "Full text", label: "search across everything" },
  { value: "On a map", label: "see every saved place" },
];

const Stats = () => {
  return (
    <section className="border-y border-line bg-cream">
      <div className="container grid grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`flex flex-col gap-1 px-4 py-7 sm:px-6 sm:py-9 ${
              i > 0 ? "border-l border-line-strong/60 pl-6 sm:pl-8" : ""
            } ${i === 2 ? "max-lg:border-l-0 max-lg:pl-0" : ""} ${
              i >= 2 ? "max-lg:border-t max-lg:border-line-strong/60" : ""
            }`}
          >
            <span className="display text-3xl text-ember-deep sm:text-4xl">
              {stat.value}
            </span>
            <span className="text-sm text-muted">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Stats;
