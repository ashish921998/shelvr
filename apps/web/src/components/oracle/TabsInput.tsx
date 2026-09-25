"use client";

import { FormEvent, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";

import { FieldHint, SubmitButton, fieldClass } from "./OracleFields";

const TITLE_SLOTS = 5;
const MAX_TITLE_CHARS = 300;
const MAX_TABS = 100_000;

export default function TabsInput({ busy, onSubmit }: OracleInputProps) {
  const [count, setCount] = useState("");
  const [titles, setTitles] = useState<string[]>(Array(TITLE_SLOTS).fill(""));
  const tabCount = Number(count);
  const validCount =
    count.trim() !== "" &&
    Number.isInteger(tabCount) &&
    tabCount >= 0 &&
    tabCount <= MAX_TABS;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validCount) return;
    onSubmit({
      kind: "tabs",
      count: tabCount,
      titles: titles
        .map((title) => title.trim().slice(0, MAX_TITLE_CHARS))
        .filter(Boolean),
    });
  }

  return (
    <form onSubmit={submit}>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Open tabs</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_TABS}
          step={1}
          required
          value={count}
          disabled={busy}
          placeholder="47"
          onChange={(event) => setCount(event.target.value)}
          className={`${fieldClass} mt-2 max-w-40`}
        />
      </label>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-ink">
          A few of their titles{" "}
          <span className="font-normal text-muted">(optional)</span>
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {titles.map((title, i) => (
            <input
              key={i}
              type="text"
              aria-label={`Tab title ${i + 1}`}
              value={title}
              disabled={busy}
              maxLength={MAX_TITLE_CHARS}
              placeholder={i === 0 ? "Flights to Lisbon (4 months ago)" : ""}
              onChange={(event) =>
                setTitles(
                  titles.map((old, j) => (j === i ? event.target.value : old)),
                )
              }
              className={fieldClass}
            />
          ))}
        </div>
      </fieldset>
      <FieldHint>The oracle already knows you rounded down.</FieldHint>
      <SubmitButton busy={busy} disabled={!validCount}>
        Roast my tabs
      </SubmitButton>
    </form>
  );
}
