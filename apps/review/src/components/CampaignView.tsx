"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { STATUS_LABEL, STATUS_ORDER, type ReviewStatus } from "@/lib/status";
import { usePlayback } from "@/lib/usePlayback";
import MembersPanel from "./MembersPanel";
import Spinner from "./Spinner";
import UploadVideo from "./UploadVideo";
import VideoCard from "./VideoCard";

type Filter = "all" | "mine" | ReviewStatus;

export default function CampaignView({ campaignId }: { campaignId: string }) {
  const id = campaignId as Id<"campaigns">;
  const campaign = useQuery(api.campaigns.get, { campaignId: id });
  const videos = useQuery(api.videos.list, { campaignId: id });
  const [filter, setFilter] = useState<Filter>("all");
  const readyMedia = useMemo(
    () =>
      (videos ?? [])
        .map((video) => video.media)
        .filter((media) => media?.status === "ready")
        .map((media) => media!._id),
    [videos],
  );
  const playback = usePlayback(readyMedia);

  if (campaign === undefined || videos === undefined) {
    return (
      <div className="flex justify-center p-16">
        <Spinner />
      </div>
    );
  }
  if (campaign === null) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 text-muted">
        This campaign doesn&apos;t exist or you&apos;re not in it.{" "}
        <Link href="/" className="text-ink underline">
          Back to campaigns
        </Link>
      </main>
    );
  }

  const shown = videos.filter((video) => {
    if (filter === "all") return true;
    if (filter === "mine") return video.isMine;
    return video.status === filter;
  });
  const counts = Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      videos.filter((video) => video.status === status).length,
    ]),
  ) as Record<ReviewStatus, number>;

  return (
    <main className="mx-auto grid max-w-[1440px] gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <nav className="flex items-center gap-1.5 text-sm text-faint">
              <Link href="/" className="transition hover:text-ink">
                Campaigns
              </Link>
              <span>/</span>
            </nav>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {campaign.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              {videos.length} {videos.length === 1 ? "video" : "videos"} ·{" "}
              {counts.needs_review} waiting on review
            </p>
          </div>
          <UploadVideo campaignId={id} />
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel p-1 text-sm sm:w-fit">
          {(["all", "mine", ...STATUS_ORDER] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                filter === option
                  ? "bg-raised text-ink shadow-sm ring-1 ring-line-strong"
                  : "text-muted hover:text-ink"
              }`}
            >
              {option === "all"
                ? "All"
                : option === "mine"
                  ? "Mine"
                  : STATUS_LABEL[option]}
              {option !== "mine" && (
                <span className="rounded-md bg-white/5 px-1.5 text-xs tabular-nums text-faint">
                  {option === "all" ? videos.length : counts[option]}
                </span>
              )}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-line-strong py-24 text-sm text-muted">
            {videos.length === 0
              ? "No videos yet. Upload the first one."
              : "Nothing here with this filter."}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {shown.map((video) => (
              <VideoCard
                key={video._id}
                video={video}
                src={video.media ? playback.get(video.media._id) : undefined}
              />
            ))}
          </div>
        )}
      </section>
      <MembersPanel campaign={campaign} />
    </main>
  );
}
