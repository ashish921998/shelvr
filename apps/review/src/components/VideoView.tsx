"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { MuxPlayerRefAttributes as MuxPlayerElement } from "@mux/mux-player-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { usePlayback } from "@/lib/usePlayback";
import CommentsPanel from "./CommentsPanel";
import Player from "./Player";
import Spinner from "./Spinner";
import StatusBadge from "./StatusBadge";
import UploadVersion from "./UploadVersion";

export default function VideoView({ videoId }: { videoId: string }) {
  const id = videoId as Id<"videos">;
  const video = useQuery(api.videos.get, { videoId: id });
  const setStatus = useMutation(api.videos.setStatus);
  const [chosen, setChosen] = useState<Id<"versions"> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const player = useRef<MuxPlayerElement | null>(null);

  const version =
    video?.versions.find((v) => v._id === chosen) ?? video?.versions[0];
  const mediaIds = useMemo(
    () => (version?.media?.status === "ready" ? [version.media._id] : []),
    [version],
  );
  const playback = usePlayback(mediaIds);

  if (video === undefined) {
    return (
      <div className="flex justify-center p-16">
        <Spinner />
      </div>
    );
  }
  if (video === null || !version) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-400">
        This video doesn&apos;t exist or you&apos;re not in its campaign.{" "}
        <Link href="/" className="text-zinc-100 underline">
          Back to campaigns
        </Link>
      </main>
    );
  }

  const seek = (seconds: number) => {
    const element = player.current;
    if (!element) return;
    element.currentTime = seconds;
    element.pause();
    setCurrentTime(seconds);
  };
  const pause = () => player.current?.pause();
  const isLatest = version._id === video.versions[0]._id;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <Link
          href={`/campaigns/${video.campaignId}`}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          {video.campaignName}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {video.title}
          </h1>
          <StatusBadge status={video.status} />
          <span className="text-sm text-zinc-500">by {video.creatorName}</span>
        </div>
        <div className="mt-4">
          <Player
            ref={player}
            media={version.media}
            playback={
              version.media ? playback.get(version.media._id) : undefined
            }
            onTime={setCurrentTime}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={version._id}
            onChange={(e) => setChosen(e.target.value as Id<"versions">)}
            className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm"
          >
            {video.versions.map((v, index) => (
              <option key={v._id} value={v._id}>
                v{v.number}
                {index === 0 ? " (latest)" : ""}
              </option>
            ))}
          </select>
          {!isLatest && (
            <span className="text-xs text-amber-300">
              You&apos;re looking at an older version.
            </span>
          )}
          {version.note && (
            <span className="text-sm text-zinc-400">“{version.note}”</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {video.canReview &&
              STATUS_ORDER.filter((s) => s !== video.status).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void setStatus({ videoId: id, status })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    status === "approved"
                      ? "bg-emerald-500 text-black"
                      : status === "changes_requested"
                        ? "bg-rose-500/90 text-white"
                        : "bg-white/10 text-zinc-200"
                  }`}
                >
                  {status === "needs_review"
                    ? "Back to needs review"
                    : status === "approved"
                      ? "Approve"
                      : "Request changes"}
                </button>
              ))}
            {video.canUpload && <UploadVersion videoId={id} />}
          </div>
        </div>
        {!video.canReview && video.status !== "needs_review" && (
          <p className="mt-3 text-sm text-zinc-500">
            An admin marked this {STATUS_LABEL[video.status].toLowerCase()}.
          </p>
        )}
      </section>
      <CommentsPanel
        key={version._id}
        versionId={version._id}
        duration={version.media?.duration ?? null}
        currentTime={currentTime}
        onSeek={seek}
        onPause={pause}
      />
    </main>
  );
}
