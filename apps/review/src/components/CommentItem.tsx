"use client";

import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Thread } from "@/lib/threads";
import { formatTime } from "@/lib/time";
import { usePlayback } from "@/lib/usePlayback";
import Avatar from "./Avatar";
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
    <span className="flex min-w-0 items-center gap-2 text-xs">
      <Avatar name={row.authorName} size="sm" />
      <span className="truncate font-semibold text-ink">{row.authorName}</span>
      {row.authorRole === "admin" && (
        <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-medium tracking-wide text-accent uppercase">
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
    <div className="mt-2 ml-8 overflow-hidden rounded-lg border border-line">
      <Player
        compact
        media={{ status: recording.status }}
        src={playback.get(recording._id)}
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
      className={`group rounded-xl p-3 transition hover:bg-white/[0.03] ${root.resolved ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Author row={root} />
        {root.timestamp !== null && (
          <button
            type="button"
            onClick={() => onSeek(root.timestamp ?? 0)}
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums transition ${
              root.recording
                ? "bg-rec/15 text-rec hover:bg-rec/25"
                : "bg-accent-soft text-accent hover:bg-accent/25"
            }`}
          >
            {formatTime(root.timestamp)}
          </button>
        )}
      </div>
      {root.body && (
        <p className="mt-1.5 ml-8 text-sm leading-relaxed whitespace-pre-wrap text-ink/85">
          {root.body}
        </p>
      )}
      {root.recording && <Recording recording={root.recording} />}
      {replies.map((row) => (
        <div
          key={row._id}
          className="mt-3 ml-8 border-l-2 border-line-strong pl-3"
        >
          <div className="flex items-center justify-between">
            <Author row={row} />
            {row.canModerate && (
              <button
                type="button"
                onClick={() => void remove({ commentId: row._id })}
                className="text-xs text-faint transition hover:text-rose-300"
              >
                Delete
              </button>
            )}
          </div>
          <p className="mt-1.5 ml-8 text-sm leading-relaxed whitespace-pre-wrap text-ink/85">
            {row.body}
          </p>
        </div>
      ))}
      <div className="mt-2 ml-8 flex gap-3 text-xs text-faint">
        <button
          type="button"
          onClick={() => setReplying(!replying)}
          className="transition hover:text-ink"
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
            className="transition hover:text-emerald-300"
          >
            {root.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
        {root.canModerate && (
          <button
            type="button"
            onClick={() => void remove({ commentId: root._id })}
            className="transition hover:text-rose-300"
          >
            Delete
          </button>
        )}
      </div>
      {replying && (
        <form onSubmit={sendReply} className="mt-2 ml-8 flex gap-2">
          <input
            autoFocus
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply…"
            className="field py-1.5"
          />
          <button
            type="submit"
            disabled={reply.trim().length === 0}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
