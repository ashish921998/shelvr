"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function usePlayback(mediaIds: Id<"media">[]): Map<string, string> {
  const fetchUrls = useAction(api.media.playbackTokens);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = [...mediaIds].sort().join(",");
  useEffect(() => {
    if (key.length === 0) return;
    let cancelled = false;
    fetchUrls({ mediaIds: key.split(",") as Id<"media">[] })
      .then((rows) => {
        if (!cancelled)
          setUrls(new Map(rows.map((row) => [row.mediaId, row.url])));
      })
      .catch(() => {
        if (!cancelled) setUrls(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [key, fetchUrls]);
  return urls;
}
