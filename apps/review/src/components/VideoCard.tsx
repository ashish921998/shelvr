import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import type { ReviewStatus } from "@/lib/status";
import { formatTime } from "@/lib/time";
import Avatar from "./Avatar";
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
    <Link
      href={`/videos/${video._id}`}
      className="group block overflow-hidden rounded-2xl border border-line bg-panel transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)]"
    >
      <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-b from-raised to-canvas">
        {src ? (
          <video
            src={`${src}#t=1`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="flex flex-col items-center gap-2 text-xs text-faint">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-white/5">
                <span className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-white/40" />
              </span>
              {MEDIA_NOTE[mediaStatus]}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute top-2.5 left-2.5 rounded-full bg-black/60 backdrop-blur-md">
          <StatusBadge status={video.status} />
        </div>
        <div className="absolute right-2.5 bottom-2.5 flex gap-1 text-[11px] font-medium tabular-nums">
          {video.latestVersion > 1 && (
            <span className="rounded-md bg-accent/90 px-1.5 py-0.5 text-white">
              v{video.latestVersion}
            </span>
          )}
          {video.media?.duration ? (
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-md">
              {formatTime(video.media.duration)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={video.creatorName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{video.title}</p>
          <p className="truncate text-xs text-muted">{video.creatorName}</p>
        </div>
      </div>
    </Link>
  );
}
