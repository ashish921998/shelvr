"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";
import {
  libraryStats,
  oracleRows,
  parseLibraryExport,
} from "@/lib/oracleLibrary";

import { FieldHint, SubmitButton, fieldClass } from "./OracleFields";

export default function LibraryInput({ busy, onSubmit }: OracleInputProps) {
  const [blob, setBlob] = useState("");
  const entries = useMemo(() => parseLibraryExport(blob), [blob]);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setBlob(await file.text());
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
          onChange={(event) => setBlob(event.target.value)}
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
      {blob.trim() === "" ? (
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
