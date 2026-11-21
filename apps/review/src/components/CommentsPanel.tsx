"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildThreads, countOpen } from "@/lib/threads";
import { formatTime, markerPercent } from "@/lib/time";
import CommentItem from "./CommentItem";
import Recorder from "./Recorder";
import Spinner from "./Spinner";

type Props = {
  versionId: Id<"versions">;
  campaignId: Id<"campaigns">;
  duration: number | null;
  currentTime: number;
  onSeek: (seconds: number) => void;
  onPause: () => void;
};

export default function CommentsPanel({
  versionId,
  campaignId,
  duration,
  currentTime,
  onSeek,
  onPause,
}: Props) {
  const rows = useQuery(api.comments.list, { versionId });
  const add = useMutation(api.comments.add);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState<number | null>(null);
  const [atTime, setAtTime] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threads = useMemo(
    () => buildThreads(rows ?? [], { showResolved }),
    [rows, showResolved],
  );
  const markers = (rows ?? []).filter(
    (row) => row.parentId === null && row.timestamp !== null && !row.resolved,
  );
  const stamp = pinned ?? currentTime;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await add({
        versionId,
        body,
        timestamp: atTime ? stamp : undefined,
      });
      setBody("");
      setPinned(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post that");
    }
  }

  return (
    <aside className="flex max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel lg:sticky lg:top-20">
      <div className="border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            Feedback
            {rows ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent tabular-nums">
                {countOpen(rows)} open
              </span>
            ) : null}
          </h2>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted select-none">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="accent-accent"
            />
            Show resolved
          </label>
        </div>
        {duration ? (
          <div className="mt-4">
            <div
              className="relative h-1.5 rounded-full bg-white/[0.07]"
              aria-label="Comment timeline"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/40 to-accent"
                style={{ width: `${markerPercent(currentTime, duration)}%` }}
              />
              {markers.map((marker) => (
                <button
                  key={marker._id}
                  type="button"
                  title={`${formatTime(marker.timestamp)} · ${marker.authorName}`}
                  onClick={() => onSeek(marker.timestamp ?? 0)}
                  className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-panel transition hover:scale-125 ${
                    marker.recording ? "bg-rec" : "bg-accent"
                  }`}
                  style={{
                    left: `${markerPercent(marker.timestamp ?? 0, duration)}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-faint tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {rows === undefined ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : threads.length === 0 ? (
          <p className="p-6 text-center text-sm leading-relaxed text-muted">
            No feedback yet. Pause on a moment and leave a note, or record a
            walkthrough.
          </p>
        ) : (
          threads.map((thread) => (
            <CommentItem
              key={thread.root._id}
              thread={thread}
              versionId={versionId}
              onSeek={onSeek}
            />
          ))
        )}
      </div>
      <form onSubmit={submit} className="border-t border-line bg-canvas/40 p-3">
        <div className="rounded-xl border border-line bg-canvas transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => {
              onPause();
              setPinned(currentTime);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={3}
            placeholder="Leave feedback…"
            className="w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-faint"
          />
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setAtTime(!atTime)}
              className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums ring-1 ring-inset transition ${
                atTime
                  ? "bg-accent-soft text-accent ring-accent/30"
                  : "text-faint ring-line-strong hover:text-muted"
              }`}
              title="Pin this note to the moment in the video"
            >
              {atTime ? `@ ${formatTime(stamp)}` : "No timestamp"}
            </button>
            <Recorder
              versionId={versionId}
              campaignId={campaignId}
              currentTime={currentTime}
              onStart={onPause}
            />
            <button
              type="submit"
              disabled={body.trim().length === 0}
              className="btn-primary ml-auto px-3 py-1.5"
            >
              Post
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      </form>
    </aside>
  );
}
