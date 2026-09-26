export const fieldClass =
  "min-h-12 w-full min-w-0 rounded-xl border border-line-strong bg-white px-4 text-base text-ink outline-none transition placeholder:text-muted-soft focus:border-ember-deep focus:ring-2 focus:ring-ember/25";

export function SubmitButton({
  busy,
  disabled = false,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-5 min-h-12 w-full rounded-xl bg-ink px-5 text-base font-semibold text-white transition hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      {busy ? "Reading the tea leaves…" : children}
    </button>
  );
}

export function FieldHint({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "alert";
  children: React.ReactNode;
}) {
  return tone === "alert" ? (
    <p role="alert" className="mt-2 text-sm font-medium text-ember-deep">
      {children}
    </p>
  ) : (
    <p className="mt-2 text-sm text-muted">{children}</p>
  );
}
