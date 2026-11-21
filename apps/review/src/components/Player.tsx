"use client";

import MuxPlayer, { type MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { forwardRef } from "react";
import type { Playback } from "@/lib/usePlayback";
import Spinner from "./Spinner";

type Props = {
  media: {
    status: "waiting" | "processing" | "ready" | "errored";
    aspectRatio: string | null;
  } | null;
  playback: Playback | undefined;
  onTime?: (seconds: number) => void;
  compact?: boolean;
};

const NOTE = {
  waiting: "Waiting for the upload to finish…",
  processing: "Processing the video. This takes about a minute.",
  errored: "This upload failed. Upload it again as a new version.",
  ready: "Loading…",
};

const Player = forwardRef<MuxPlayerRefAttributes, Props>(function Player(
  { media, playback, onTime, compact },
  ref,
) {
  const status = media?.status ?? "waiting";
  const frame = compact
    ? "aspect-video w-full"
    : "mx-auto h-[min(70vh,720px)] w-full";
  if (status !== "ready" || !playback) {
    return (
      <div
        className={`${frame} grid place-items-center rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-400`}
      >
        {status === "ready" || status === "processing" ? (
          <Spinner label={NOTE[status]} />
        ) : (
          NOTE[status]
        )}
      </div>
    );
  }
  return (
    <div className={`${frame} overflow-hidden rounded-xl bg-black`}>
      <MuxPlayer
        ref={ref}
        playbackId={playback.playbackId}
        tokens={{
          playback: playback.playback,
          thumbnail: playback.thumbnail,
          storyboard: playback.storyboard,
        }}
        streamType="on-demand"
        accentColor="#fb923c"
        onTimeUpdate={(event) => {
          const target = event.target as HTMLMediaElement | null;
          if (target && onTime) onTime(target.currentTime);
        }}
      />
    </div>
  );
});

export default Player;
