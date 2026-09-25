"use client";

import { FormEvent, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";

import { FieldHint, SubmitButton, fieldClass } from "./OracleFields";

/** The oracle reads https pages only, so a bare domain or an http link is
 * upgraded rather than refused. */
function toHttps(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text.replace(/^http:\/\//i, "https://")
    : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" && url.hostname.includes(".")
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export default function LinksInput({ busy, onSubmit }: OracleInputProps) {
  const [values, setValues] = useState(["", "", ""]);
  const parsed = values.map(toHttps);
  const urls = parsed.filter((url): url is string => url !== undefined);
  const invalid = values.some((value, i) => value.trim() && !parsed[i]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (urls.length > 0 && !invalid) onSubmit({ kind: "links", urls });
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-3">
        {values.map((value, i) => (
          <label key={i} className="block">
            <span className="sr-only">Saved link {i + 1}</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={value}
              disabled={busy}
              placeholder={
                [
                  "nytimes.com/…",
                  "a recipe you never cooked",
                  "that one video",
                ][i]
              }
              onChange={(event) =>
                setValues(
                  values.map((old, j) => (j === i ? event.target.value : old)),
                )
              }
              className={fieldClass}
            />
          </label>
        ))}
      </div>
      {invalid ? (
        <FieldHint tone="alert">
          One of those doesn’t look like a link.
        </FieldHint>
      ) : (
        <FieldHint>One is enough. Three is better.</FieldHint>
      )}
      <SubmitButton busy={busy} disabled={urls.length === 0 || invalid}>
        Read my links
      </SubmitButton>
    </form>
  );
}
