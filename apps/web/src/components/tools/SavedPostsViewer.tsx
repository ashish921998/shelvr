"use client";

import {
  ArrowDownTrayIcon,
  ArrowUpRightIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import { useAppStoreLink } from "@/lib/appStoreLink";
import { sampleSaves } from "@/lib/instagramSample";
import {
  matchesQuery,
  readSaves,
  summarize,
  toCsv,
  type ReadResult,
  type SavedPost,
} from "@/lib/instagramSaves";

const PAGE = 50;

const PROBLEMS: Record<Extract<ReadResult, { ok: false }>["reason"], string> = {
  no_saved_files:
    "That zip has no saved posts in it. When you request the download, tick “Saved” and pick JSON.",
  no_saves:
    "No saved posts in that file. Pick saved_posts.json (or the whole zip) from your Instagram download.",
  too_large:
    "That file is too big to be saved_posts.json. Choose the zip, or the saved_posts.json file inside it.",
  unreadable:
    "Couldn’t read that file. Try the zip from Instagram as it downloaded, without renaming it.",
  old_browser:
    "This browser can’t open zip files. Update it, or unzip the download and choose saved_posts.json.",
};

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
});

type Loaded = { saves: SavedPost[]; sample: boolean; fromHtml?: boolean };

export default function SavedPostsViewer() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function open(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setProblem(null);
    const result = await readSaves(files);
    setBusy(false);
    if (!result.ok) {
      setProblem(PROBLEMS[result.reason]);
      captureWebAnalyticsEvent("ig_tool_failed", { reason: result.reason });
      return;
    }
    setLoaded({
      saves: result.saves,
      sample: false,
      fromHtml: result.fromHtml,
    });
    captureWebAnalyticsEvent("ig_tool_opened", {
      format: result.format,
      count: result.saves.length,
    });
  }

  function trySample() {
    setProblem(null);
    setLoaded({ saves: sampleSaves(), sample: true });
    captureWebAnalyticsEvent("ig_tool_sample_opened");
  }

  return (
    <div className="mt-8">
      {loaded ? (
        <Results loaded={loaded} onReset={() => setLoaded(null)} />
      ) : (
        <Picker
          busy={busy}
          problem={problem}
          onOpen={(files) => void open(files)}
          onSample={trySample}
        />
      )}
    </div>
  );
}

function Picker({
  busy,
  problem,
  onOpen,
  onSample,
}: {
  busy: boolean;
  problem: string | null;
  onOpen: (files: File[]) => void;
  onSample: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    onOpen([...(event.target.files ?? [])]);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    onOpen([...event.dataTransfer.files]);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`rounded-3xl border-2 border-dashed px-5 py-8 text-center transition-colors sm:px-10 sm:py-10 ${
        dragging ? "border-ember bg-ember-soft" : "border-line-strong bg-cream"
      }`}
    >
      <p className="font-display text-[28px] leading-tight sm:text-[32px]">
        Open your Instagram download
      </p>
      <p className="mx-auto mt-2 max-w-[38ch] text-[15px] leading-normal text-muted">
        The .zip Instagram sends you, or the saved_posts.json file inside it.
      </p>
      <label
        className={`mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-ink px-6 text-base font-semibold text-paper transition hover:bg-ink-soft focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink sm:w-auto ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {busy ? "Reading your saves…" : "Choose file"}
        <input
          type="file"
          multiple
          accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
          disabled={busy}
          onChange={pick}
          className="sr-only"
        />
      </label>
      <div>
        <button
          type="button"
          onClick={onSample}
          disabled={busy}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted underline decoration-line-strong underline-offset-4 transition hover:text-ember-deep"
        >
          No file yet? Try a sample
        </button>
      </div>
      {problem && (
        <p
          role="alert"
          className="mx-auto mt-3 max-w-[44ch] text-sm font-medium text-terracotta"
        >
          {problem}
        </p>
      )}
      <p className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-muted">
        <LockClosedIcon aria-hidden className="size-4" />
        Runs on your device. Your file is never uploaded.
      </p>
    </div>
  );
}

function downloadCsv(saves: SavedPost[]) {
  const blob = new Blob([toCsv(saves)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "instagram-saved-posts.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  captureWebAnalyticsEvent("ig_tool_csv_downloaded", { count: saves.length });
}

function Results({ loaded, onReset }: { loaded: Loaded; onReset: () => void }) {
  const { saves, sample, fromHtml } = loaded;
  const summary = useMemo(() => summarize(saves), [saves]);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const matches = useMemo(
    () => saves.filter((save) => matchesQuery(save, query)),
    [saves, query],
  );

  function filter(value: string) {
    setQuery(value);
    setShown(PAGE);
  }

  const facts = [
    summary.accounts > 0 &&
      `from ${summary.accounts.toLocaleString("en")} accounts`,
    summary.reels > 0 && `${summary.reels.toLocaleString("en")} reels`,
    summary.oldestAt &&
      `saving since ${monthFormat.format(new Date(summary.oldestAt))}`,
  ].filter(Boolean);

  return (
    <section>
      {sample && (
        <p className="mb-4 rounded-xl bg-ember-soft px-4 py-3 text-sm text-ink-soft">
          This is a made-up sample.{" "}
          <button
            type="button"
            onClick={onReset}
            className="font-semibold text-ember-deep underline underline-offset-4"
          >
            Open your own download
          </button>
        </p>
      )}
      <div className="rounded-3xl bg-card p-5 shadow-card sm:p-7">
        <p className="font-display text-[44px] leading-none sm:text-[56px]">
          {summary.count.toLocaleString("en")}{" "}
          <span className="text-[24px] sm:text-[28px]">
            saved {summary.count === 1 ? "post" : "posts"}
          </span>
        </p>
        {facts.length > 0 && (
          <p className="mt-2 text-[15px] text-muted">{facts.join(" · ")}</p>
        )}
        {fromHtml && summary.accounts === 0 && (
          <p className="mt-3 rounded-xl bg-ember-soft px-4 py-3 text-sm text-ink-soft">
            This is the HTML version of the download, which leaves out who
            posted each save and when. Request it again with the format set to
            JSON to see both.
          </p>
        )}

        {summary.collections.length > 0 && (
          <ChipRow
            label="Collections"
            items={summary.collections.map((c) => ({
              key: c.name,
              text: c.name,
              count: c.count,
            }))}
            active={query}
            onPick={filter}
          />
        )}
        {summary.topAccounts.length > 0 && (
          <ChipRow
            label="Saved most from"
            items={summary.topAccounts.map((a) => ({
              key: a.author,
              text: `@${a.author}`,
              count: a.count,
            }))}
            active={query}
            onPick={filter}
          />
        )}

        <label className="relative mt-6 block">
          <span className="sr-only">Search your saved posts</span>
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => filter(event.target.value)}
            placeholder="Search by account or collection"
            className="min-h-12 w-full rounded-xl border border-line-strong bg-white pr-4 pl-11 text-base text-ink outline-none transition placeholder:text-muted focus:border-ember-deep focus:ring-2 focus:ring-ember/25"
          />
        </label>

        <p aria-live="polite" className="mt-4 text-sm text-muted">
          {query.trim()
            ? `${matches.length.toLocaleString("en")} of ${saves.length.toLocaleString("en")} match`
            : "Newest first"}
        </p>
        <ul className="mt-2 divide-y divide-line">
          {matches.slice(0, shown).map((save) => (
            <SaveRow key={save.url} save={save} sample={sample} />
          ))}
        </ul>
        {matches.length > shown && (
          <button
            type="button"
            onClick={() => setShown(shown + PAGE)}
            className="mt-3 min-h-12 w-full rounded-xl border border-line-strong text-[15px] font-semibold text-ink transition hover:bg-paper-deep"
          >
            Show {Math.min(PAGE, matches.length - shown)} more
          </button>
        )}

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => downloadCsv(matches)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-white px-5 text-[15px] font-semibold text-ink transition hover:bg-paper-deep"
          >
            <ArrowDownTrayIcon aria-hidden className="size-5" />
            {matches.length < saves.length
              ? `Download these ${matches.length.toLocaleString("en")} (CSV)`
              : "Download as spreadsheet (CSV)"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="min-h-11 text-sm font-semibold text-muted underline decoration-line-strong underline-offset-4 hover:text-ember-deep"
          >
            Open another file
          </button>
        </div>
      </div>

      <ProductCta />
    </section>
  );
}

function ChipRow({
  label,
  items,
  active,
  onPick,
}: {
  label: string;
  items: { key: string; text: string; count: number }[];
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-5">
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const on = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? "" : item.key)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
                on
                  ? "border-ink bg-ink text-paper"
                  : "border-line-strong bg-white text-ink hover:border-ember-deep"
              }`}
            >
              {item.text}
              <span className={on ? "text-paper/70" : "text-muted"}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SaveRow({ save, sample }: { save: SavedPost; sample: boolean }) {
  const details = [
    save.kind === "reel" ? "Reel" : save.kind === "video" ? "Video" : "Post",
    save.savedAt && dateFormat.format(new Date(save.savedAt)),
    ...save.collections,
  ].filter(Boolean);
  const body = (
    <>
      <span
        aria-hidden
        className="flex size-10 flex-none items-center justify-center rounded-full bg-paper-deep font-display text-lg text-ember-deep uppercase"
      >
        {(save.author ?? "?").slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          {save.author ? `@${save.author}` : "Instagram post"}
        </span>
        <span className="block truncate text-[13px] text-muted">
          {details.join(" · ")}
        </span>
      </span>
      {!sample && (
        <ArrowUpRightIcon aria-hidden className="size-5 flex-none text-muted" />
      )}
    </>
  );
  return (
    <li>
      {sample ? (
        <div className="flex min-h-16 items-center gap-3 py-2.5">{body}</div>
      ) : (
        <a
          href={save.url}
          target="_blank"
          rel="noopener noreferrer"
          className="-mx-2 flex min-h-16 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-paper-deep"
        >
          {body}
        </a>
      )}
    </li>
  );
}

function ProductCta() {
  const { href, onClick } = useAppStoreLink("ig_tool");
  return (
    <div className="mt-6 rounded-3xl bg-ink px-6 py-8 text-center text-paper sm:px-10">
      <p className="font-display text-[28px] leading-tight text-balance sm:text-[34px]">
        Saving recipes and places you never find again?
      </p>
      <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-normal text-pretty text-paper/75">
        Share any post to Shelvr and it lands on the right shelf: recipes,
        trips, things to buy. Search them by what you remember.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-ember px-6 text-base font-bold text-ink transition hover:bg-ember-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper sm:w-auto"
      >
        Get Shelvr on the App Store
      </a>
    </div>
  );
}
