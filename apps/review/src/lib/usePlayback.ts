"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type Playback = {
  playbackId: string;
  playback: string;
  thumbnail: string;
  storyboard: string;
};

export function usePlayback(mediaIds: Id<"media">[]): Map<string, Playback> {
  const fetchTokens = useAction(api.media.playbackTokens);
  const [tokens, setTokens] = useState<Map<string, Playback>>(new Map());
  const key = [...mediaIds].sort().join(",");
  useEffect(() => {
    if (key.length === 0) return;
    let cancelled = false;
    fetchTokens({ mediaIds: key.split(",") as Id<"media">[] })
      .then((rows) => {
        if (cancelled) return;
        setTokens(new Map(rows.map((row) => [row.mediaId, row])));
      })
      .catch(() => {
        if (!cancelled) setTokens(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [key, fetchTokens]);
  return tokens;
}

export function thumbnailUrl(playback: Playback): string {
  return `https://image.mux.com/${playback.playbackId}/thumbnail.webp?token=${playback.thumbnail}`;
}
