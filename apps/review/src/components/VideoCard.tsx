import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import type { ReviewStatus } from "@/lib/status";
import { formatTime } from "@/lib/time";
import StatusBadge from "./StatusBadge";

type Props = {
  video: {
    _id: Id<"videos">;
    title: string;
    status: ReviewStatus;
    creatorName: string;
    latestVersion: number;
    media: {
      status: "waiting" | "processing" | "ready" | "errored";
      duration: number | null;
    } | null;
  };
  src: string | undefined;
};

const MEDIA_NOTE = {
  waiting: "Uploading…",
  processing: "Processing…",
  errored: "Upload failed",
  ready: "",
};

export default function VideoCard({ video, src }: Props) {
  const mediaStatus = video.media?.status ?? "waiting";
  return (
    <Link href={`/videos/${video._id}`} className="group block">
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/5 transition group-hover:ring-white/25">
        {src ? (
          <video
            src={`${src}#t=1`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-xs text-zinc-500">
            {MEDIA_NOTE[mediaStatus] || "…"}
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-full bg-black/70 backdrop-blur">
          <StatusBadge status={video.status} />
        </div>
        <div className="absolute bottom-2 right-2 flex gap-1 text-[11px] font-medium">
          {video.latestVersion > 1 && (
            <span className="rounded bg-black/70 px-1.5 py-0.5">
              v{video.latestVersion}
            </span>
          )}
          {video.media?.duration ? (
            <span className="rounded bg-black/70 px-1.5 py-0.5">
              {formatTime(video.media.duration)}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-medium">{video.title}</p>
      <p className="truncate text-xs text-zinc-500">{video.creatorName}</p>
    </Link>
  );
}
