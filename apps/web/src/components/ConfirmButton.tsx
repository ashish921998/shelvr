"use client";

import { useFormStatus } from "react-dom";

/** Disabled while its form's server action runs, so a second tap cannot re-spend the one-time token. */
export default function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-6 min-h-12 rounded-xl bg-ember px-6 font-semibold text-ink disabled:opacity-60"
    >
      {pending ? "Confirming…" : "Confirm my request"}
    </button>
  );
}
