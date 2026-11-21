"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import Spinner from "./Spinner";

export type PlayerHandle = {
  seek: (seconds: number) => void;
  pause: () => void;
};

type Props = {
  media: { status: "waiting" | "processing" | "ready" | "errored" } | null;
  src: string | undefined;
  onTime?: (seconds: number) => void;
  compact?: boolean;
};

const NOTE = {
  waiting: "Waiting for the upload to finish…",
  processing: "Processing the video…",
  errored: "This upload failed. Upload it again as a new version.",
  ready: "Loading…",
};

const Player = forwardRef<PlayerHandle, Props>(function Player(
  { media, src, onTime, compact },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  useImperativeHandle(ref, () => ({
    seek: (seconds) => {
      const element = video.current;
      if (!element) return;
      element.pause();
      element.currentTime = seconds;
    },
    pause: () => video.current?.pause(),
  }));

  const status = media?.status ?? "waiting";
  const box = compact
    ? "aspect-video w-full"
    : "mx-auto h-[min(70vh,720px)] w-full";
  if (status !== "ready" || !src) {
    return (
      <div
        className={`${box} grid place-items-center rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-400`}
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
    <div className={`${box} overflow-hidden rounded-xl bg-black`}>
      <video
        ref={video}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onLoadedMetadata={(event) => {
          if (position.current > 0) {
            event.currentTarget.currentTime = position.current;
          }
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.readyState === 0) return;
          position.current = event.currentTarget.currentTime;
          onTime?.(event.currentTarget.currentTime);
        }}
        onSeeked={(event) => {
          position.current = event.currentTarget.currentTime;
          onTime?.(event.currentTarget.currentTime);
        }}
      />
    </div>
  );
});

export default Player;
