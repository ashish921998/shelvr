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
      <main className="mx-auto max-w-3xl px-4 py-16 text-zinc-400">
        This campaign doesn&apos;t exist or you&apos;re not in it.{" "}
        <Link href="/" className="text-zinc-100 underline">
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
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1fr_300px]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              Campaigns
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              {campaign.name}
            </h1>
          </div>
          <UploadVideo campaignId={id} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {(["all", "mine", ...STATUS_ORDER] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1 ring-1 ring-inset ${
                filter === option
                  ? "bg-white text-black ring-white"
                  : "text-zinc-400 ring-white/10 hover:text-zinc-100"
              }`}
            >
              {option === "all"
                ? `All ${videos.length}`
                : option === "mine"
                  ? "Mine"
                  : `${STATUS_LABEL[option]} ${counts[option]}`}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="mt-16 text-center text-zinc-500">
            {videos.length === 0
              ? "No videos yet. Upload the first one."
              : "Nothing here with this filter."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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
