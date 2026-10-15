/** The extra spaces the oracle named, held back until the visitor shares the
 * verdict. While locked, the names are not rendered: each shows as a blurred
 * placeholder of the same length. */
export default function LockedSpaces({
  names,
  unlocked,
}: {
  names: string[];
  unlocked: boolean;
}) {
  if (names.length === 0) return null;
  return (
    <section className="mt-5 rounded-3xl border border-dashed border-line-strong bg-card px-6 py-6 sm:px-8">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {unlocked
          ? `${names.length} more spaces the oracle sees`
          : `${names.length} more spaces, locked`}
      </h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {names.map((name, i) => (
          <li
            key={i}
            className="rounded-full border-2 border-ember px-4 py-2 text-base font-semibold text-ink"
          >
            {unlocked ? (
              name
            ) : (
              <span aria-hidden className="select-none blur-sm">
                {"x".repeat(name.length)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px] text-ink-soft" aria-live="polite">
        {unlocked
          ? "Unlocked. Your shelf is bigger than you think."
          : "Share or save your verdict to unlock them."}
      </p>
    </section>
  );
}
