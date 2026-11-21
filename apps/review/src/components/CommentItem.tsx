"use client";

import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Thread } from "@/lib/threads";
import { formatTime } from "@/lib/time";
import { usePlayback } from "@/lib/usePlayback";
import Player from "./Player";

type Row = {
  _id: Id<"comments">;
  _creationTime: number;
  authorName: string;
  authorRole: "admin" | "creator" | null;
  isMine: boolean;
  canModerate: boolean;
  canResolve: boolean;
  parentId: Id<"comments"> | null;
  timestamp: number | null;
  body: string;
  resolved: boolean;
  recording: {
    _id: Id<"media">;
    status: "waiting" | "processing" | "ready" | "errored";
    duration: number | null;
  } | null;
};

type Props = {
  thread: Thread<Row>;
  versionId: Id<"versions">;
  onSeek: (seconds: number) => void;
};

function Author({ row }: { row: Row }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="font-medium text-zinc-200">{row.authorName}</span>
      {row.authorRole === "admin" && (
        <span className="rounded bg-white/10 px-1 py-px text-[10px] uppercase tracking-wide text-zinc-400">
          admin
        </span>
      )}
    </span>
  );
}

function Recording({
  recording,
}: {
  recording: NonNullable<Row["recording"]>;
}) {
  const ids = useMemo(
    () => (recording.status === "ready" ? [recording._id] : []),
    [recording],
  );
  const playback = usePlayback(ids);
  return (
    <div className="mt-2">
      <Player
        compact
        media={{ status: recording.status, aspectRatio: null }}
        playback={playback.get(recording._id)}
      />
    </div>
  );
}

export default function CommentItem({ thread, versionId, onSeek }: Props) {
  const add = useMutation(api.comments.add);
  const setResolved = useMutation(api.comments.setResolved);
  const remove = useMutation(api.comments.remove);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const { root, replies } = thread;

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    await add({ versionId, body: reply, parentId: root._id });
    setReply("");
    setReplying(false);
  }

  return (
    <div
      className={`rounded-lg p-3 hover:bg-white/[0.03] ${root.resolved ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Author row={root} />
        {root.timestamp !== null && (
          <button
            type="button"
            onClick={() => onSeek(root.timestamp ?? 0)}
            className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              root.recording
                ? "bg-pink-400/15 text-pink-300"
                : "bg-orange-400/15 text-orange-300"
            }`}
          >
            {formatTime(root.timestamp)}
          </button>
        )}
      </div>
      {root.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
          {root.body}
        </p>
      )}
      {root.recording && <Recording recording={root.recording} />}
      {replies.map((row) => (
        <div key={row._id} className="ml-3 mt-3 border-l border-white/10 pl-3">
          <div className="flex items-center justify-between">
            <Author row={row} />
            {row.canModerate && (
              <button
                type="button"
                onClick={() => void remove({ commentId: row._id })}
                className="text-xs text-zinc-600 hover:text-rose-300"
              >
                Delete
              </button>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
            {row.body}
          </p>
        </div>
      ))}
      <div className="mt-2 flex gap-3 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => setReplying(!replying)}
          className="hover:text-zinc-200"
        >
          Reply
        </button>
        {root.canResolve && (
          <button
            type="button"
            onClick={() =>
              void setResolved({
                commentId: root._id,
                resolved: !root.resolved,
              })
            }
            className="hover:text-zinc-200"
          >
            {root.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
        {root.canModerate && (
          <button
            type="button"
            onClick={() => void remove({ commentId: root._id })}
            className="hover:text-rose-300"
          >
            Delete
          </button>
        )}
      </div>
      {replying && (
        <form onSubmit={sendReply} className="mt-2 flex gap-2">
          <input
            autoFocus
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply…"
            className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm outline-none focus:border-orange-400"
          />
          <button
            type="submit"
            disabled={reply.trim().length === 0}
            className="rounded-md bg-white px-2 py-1 text-xs font-medium text-black disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
