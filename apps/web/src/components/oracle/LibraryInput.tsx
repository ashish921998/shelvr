"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";
import {
  libraryStats,
  oracleRows,
  parseLibraryExport,
} from "@/lib/oracleLibrary";

import { FieldHint, SubmitButton, fieldClass } from "./OracleFields";

// Larger exports can freeze a phone while they are parsed, and 40 sampled
// saves read the same from a smaller slice of history.
const MAX_EXPORT_BYTES = 5 * 1024 * 1024;

export default function LibraryInput({ busy, onSubmit }: OracleInputProps) {
  const [blob, setBlob] = useState("");
  const [tooLarge, setTooLarge] = useState(false);
  const entries = useMemo(
    () => (tooLarge ? [] : parseLibraryExport(blob)),
    [blob, tooLarge],
  );

  function take(text: string, bytes: number) {
    const over = bytes > MAX_EXPORT_BYTES;
    setTooLarge(over);
    setBlob(over ? "" : text);
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_EXPORT_BYTES) {
      take("", file.size);
      return;
    }
    const text = await file.text();
    take(text, file.size);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entries.length === 0) return;
    onSubmit({
      kind: "library",
      rows: oracleRows(entries),
      stats: libraryStats(entries),
    });
  }

  return (
    <form onSubmit={submit}>
      <label className="block">
        <span className="sr-only">Your bookmarks or saved-posts export</span>
        <textarea
          value={blob}
          disabled={busy}
          rows={6}
          spellCheck={false}
          placeholder="Paste a bookmarks .html export, Instagram’s saved_posts.json, or one link per line"
          onChange={(event) =>
            take(event.target.value, event.target.value.length)
          }
          className={`${fieldClass} py-3 font-mono text-sm`}
        />
      </label>
      <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep">
        Or choose the export file
        <input
          type="file"
          accept=".html,.htm,.json,.txt,text/html,application/json,text/plain"
          disabled={busy}
          onChange={pickFile}
          className="sr-only"
        />
      </label>
      {tooLarge ? (
        <FieldHint tone="alert">
          That export is over 5 MB. Try a smaller one, or paste part of it.
        </FieldHint>
      ) : blob.trim() === "" ? (
        <FieldHint>
          Chrome, Safari, and Firefox all export bookmarks as HTML. It is read
          in your browser; the oracle sees the totals and a sample of 40 saves.
        </FieldHint>
      ) : entries.length === 0 ? (
        <FieldHint tone="alert">No links in there. Check the export?</FieldHint>
      ) : (
        <FieldHint>
          Found {entries.length.toLocaleString("en-US")} saves.
        </FieldHint>
      )}
      <SubmitButton busy={busy} disabled={entries.length === 0}>
        Get the damage report
      </SubmitButton>
    </form>
  );
}
