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
    <aside className="flex max-h-[calc(100vh-5rem)] flex-col rounded-xl border border-white/10 bg-white/[0.02] lg:sticky lg:top-16">
      <div className="border-b border-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">
            Feedback{" "}
            {rows ? (
              <span className="text-zinc-500">· {countOpen(rows)} open</span>
            ) : null}
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            Show resolved
          </label>
        </div>
        {duration ? (
          <div
            className="relative mt-3 h-2 rounded-full bg-white/10"
            aria-label="Comment timeline"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/15"
              style={{ width: `${markerPercent(currentTime, duration)}%` }}
            />
            {markers.map((marker) => (
              <button
                key={marker._id}
                type="button"
                title={`${formatTime(marker.timestamp)} · ${marker.authorName}`}
                onClick={() => onSeek(marker.timestamp ?? 0)}
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#0b0b0d] ${
                  marker.recording ? "bg-pink-400" : "bg-orange-400"
                }`}
                style={{
                  left: `${markerPercent(marker.timestamp ?? 0, duration)}%`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {rows === undefined ? (
          <div className="p-4">
            <Spinner />
          </div>
        ) : threads.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
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
      <form onSubmit={submit} className="space-y-2 border-t border-white/5 p-3">
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
          className="w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-sm outline-none focus:border-orange-400"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAtTime(!atTime)}
            className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums ring-1 ring-inset ${
              atTime
                ? "bg-orange-400/15 text-orange-300 ring-orange-400/30"
                : "text-zinc-500 ring-white/10"
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
            className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
          >
            Post
          </button>
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </form>
    </aside>
  );
}
