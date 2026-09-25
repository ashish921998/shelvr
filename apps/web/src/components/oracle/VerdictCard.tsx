import type { OracleVerdict } from "@/lib/oracle";
import type { LibraryStats } from "@/lib/oracleLibrary";

function statsLine(stats: LibraryStats): string {
  const parts = [`${stats.count.toLocaleString("en-US")} saves`];
  if (stats.oldestAt !== undefined) {
    const oldest = new Date(stats.oldestAt).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    parts.push(`oldest from ${oldest}`);
  }
  if (stats.topDomains.length > 0) {
    parts.push(`mostly ${stats.topDomains.join(", ")}`);
  }
  return parts.join(" · ");
}

export default function VerdictCard({
  verdict,
  stats,
}: {
  verdict: OracleVerdict;
  stats?: LibraryStats;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-card shadow-lift">
      <div className="bg-ember-soft px-6 pb-6 pt-7 sm:px-8">
        <p className="section-kicker">The oracle says you are</p>
        <h2 className="display mt-3 text-4xl leading-tight text-ink sm:text-5xl">
          {verdict.persona}
        </h2>
        <p className="mt-3 text-lg leading-7 text-ink-soft">
          {verdict.tagline}
        </p>
        {stats && (
          <p className="mt-4 text-sm font-medium text-shelf">
            {statsLine(stats)}
          </p>
        )}
      </div>

      <div className="px-6 py-6 sm:px-8">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          What the oracle sees
        </h3>
        <ul className="mt-3 flex flex-col gap-3">
          {verdict.guesses.map((guess, i) => (
            <li key={i} className="rounded-2xl border border-line bg-paper p-4">
              <p className="font-semibold text-ink">{guess.label}</p>
              <p className="mt-1 text-[15px] leading-6 text-ink-soft">
                {guess.why}
              </p>
            </li>
          ))}
        </ul>

        <h3 className="mt-7 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Your spaces in Shelvr
        </h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {verdict.spaces.map((space, i) => (
            <li
              key={i}
              className="rounded-2xl border border-line-strong bg-cream p-4"
            >
              <p className="display text-xl text-ink">{space.name}</p>
              <p className="mt-1 text-sm leading-5 text-muted">
                {space.reason}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
