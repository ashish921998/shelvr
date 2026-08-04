const stats = [
  { value: "1 tap", label: "to capture anything" },
  { value: "AI", label: "titles, tags & spaces" },
  { value: "Spaces", label: "that fill themselves" },
  { value: "Search", label: "across every save" },
];

const Stats = () => {
  return (
    <section className="py-6 sm:py-8">
      <div className="container">
        <div className="rounded-[1.75rem] bg-ink text-white px-6 py-8 sm:px-10 sm:py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center lg:text-left">
                <p className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-sm text-white/65">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Stats;
