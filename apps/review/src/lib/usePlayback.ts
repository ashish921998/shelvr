"use client";

import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

const REFRESH_AFTER_MS = 5 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 5000;

export function usePlayback(mediaIds: Id<"media">[]): Map<string, string> {
  const fetchUrls = useAction(api.media.playbackTokens);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [round, setRound] = useState(0);
  const fetchedAt = useRef(0);
  const key = [...mediaIds].sort().join(",");

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        fetchedAt.current > 0 &&
        Date.now() - fetchedAt.current > REFRESH_AFTER_MS
      ) {
        setRound((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (key.length === 0) return;
    let cancelled = false;
    let retry: number | undefined;
    fetchUrls({ mediaIds: key.split(",") as Id<"media">[] })
      .then((rows) => {
        if (cancelled) return;
        fetchedAt.current = Date.now();
        setUrls(new Map(rows.map((row) => [row.mediaId, row.url])));
      })
      .catch(() => {
        if (cancelled) return;
        retry = window.setTimeout(() => setRound((n) => n + 1), RETRY_AFTER_MS);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
    };
  }, [key, fetchUrls, round]);
  return urls;
}
