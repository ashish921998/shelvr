"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/status";
import { usePlayback } from "@/lib/usePlayback";
import CommentsPanel from "./CommentsPanel";
import Player, { type PlayerHandle } from "./Player";
import Spinner from "./Spinner";
import StatusBadge from "./StatusBadge";
import UploadVersion from "./UploadVersion";

export default function VideoView({ videoId }: { videoId: string }) {
  const id = videoId as Id<"videos">;
  const video = useQuery(api.videos.get, { videoId: id });
  const setStatus = useMutation(api.videos.setStatus);
  const [chosen, setChosen] = useState<Id<"versions"> | null>(null);
  const [clock, setClock] = useState<{
    versionId: Id<"versions"> | null;
    seconds: number;
  }>({ versionId: null, seconds: 0 });
  const [statusError, setStatusError] = useState<string | null>(null);
  const player = useRef<PlayerHandle | null>(null);

  if (chosen === null && video?.versions[0]) {
    setChosen(video.versions[0]._id);
  }
  const version =
    video?.versions.find((v) => v._id === chosen) ?? video?.versions[0];
  const currentTime = clock.versionId === version?._id ? clock.seconds : 0;
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
      <main className="mx-auto max-w-3xl px-5 py-16 text-muted">
        This video doesn&apos;t exist or you&apos;re not in its campaign.{" "}
        <Link href="/" className="text-ink underline">
          Back to campaigns
        </Link>
      </main>
    );
  }

  const setCurrentTime = (seconds: number) =>
    setClock({ versionId: version._id, seconds });
  const seek = (seconds: number) => {
    player.current?.seek(seconds);
    setCurrentTime(seconds);
  };
  const pause = () => player.current?.pause();
  const openVersion = (versionId: Id<"versions">) => {
    setChosen(versionId);
    setClock({ versionId, seconds: 0 });
  };
  const decide = (status: (typeof STATUS_ORDER)[number]) => {
    setStatusError(null);
    setStatus({ videoId: id, versionId: version._id, status }).catch(
      (error: unknown) =>
        setStatusError(
          error instanceof Error ? error.message : "That didn't save.",
        ),
    );
  };
  const isLatest = version._id === video.versions[0]._id;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="min-w-0">
        <nav className="flex items-center gap-1.5 text-sm text-faint">
          <Link href="/" className="transition hover:text-ink">
            Campaigns
          </Link>
          <span>/</span>
          <Link
            href={`/campaigns/${video.campaignId}`}
            className="transition hover:text-ink"
          >
            {video.campaignName}
          </Link>
        </nav>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {video.title}
          </h1>
          <StatusBadge status={video.status} />
          <span className="text-sm text-muted">by {video.creatorName}</span>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-black shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]">
          <Player
            key={version._id}
            ref={player}
            media={version.media}
            src={version.media ? playback.get(version.media._id) : undefined}
            onTime={setCurrentTime}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel px-3 py-2.5">
            <label className="flex items-center gap-2 text-xs text-faint">
              Version
              <select
                value={version._id}
                onChange={(e) => openVersion(e.target.value as Id<"versions">)}
                className="field w-auto py-1.5 pr-8 font-medium"
              >
                {video.versions.map((v, index) => (
                  <option key={v._id} value={v._id}>
                    v{v.number}
                    {index === 0 ? " (latest)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {!isLatest && (
              <button
                type="button"
                onClick={() => openVersion(video.versions[0]._id)}
                className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-amber-400/25 transition ring-inset hover:bg-amber-400/20"
              >
                You&apos;re looking at an older version. Open v
                {video.versions[0].number}
              </button>
            )}
            {version.note && (
              <span className="truncate text-sm text-muted italic">
                “{version.note}”
              </span>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              {video.canReview &&
                isLatest &&
                STATUS_ORDER.filter((s) => s !== video.status).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => decide(status)}
                    className={
                      status === "approved"
                        ? "btn bg-emerald-500 py-1.5 text-black hover:bg-emerald-400"
                        : status === "changes_requested"
                          ? "btn bg-rose-500/15 py-1.5 text-rose-300 ring-1 ring-rose-400/30 ring-inset hover:bg-rose-500/25"
                          : "btn-secondary py-1.5"
                    }
                  >
                    {status === "needs_review"
                      ? "Back to needs review"
                      : status === "approved"
                        ? "Approve"
                        : "Request changes"}
                  </button>
                ))}
              {video.canUpload && (
                <UploadVersion videoId={id} campaignId={video.campaignId} />
              )}
            </div>
          </div>
        </div>
        {statusError && (
          <p className="mt-3 text-sm text-rose-300">{statusError}</p>
        )}
        {!video.canReview && video.status !== "needs_review" && (
          <p className="mt-3 text-sm text-muted">
            An admin marked this {STATUS_LABEL[video.status].toLowerCase()}.
          </p>
        )}
      </section>
      <CommentsPanel
        key={version._id}
        versionId={version._id}
        campaignId={video.campaignId}
        duration={version.media?.duration ?? null}
        currentTime={currentTime}
        onSeek={seek}
        onPause={pause}
      />
    </main>
  );
}
