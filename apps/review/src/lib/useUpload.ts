"use client";

import { useAction, useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { putFile, readVideoInfo, videoContentType } from "./upload";

export function useUpload() {
  const createUpload = useAction(api.media.createUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const start = useMutation(api.media.start);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const upload = useCallback(
    async (mediaId: Id<"media">, file: Blob, info?: { duration?: number }) => {
      setError(null);
      setProgress(0);
      try {
        const [target, read] = await Promise.all([
          createUpload({ mediaId, contentType: videoContentType(file) }),
          readVideoInfo(file),
        ]);
        await putFile(target.url, file, target.contentType, setProgress);
        const result = await completeUpload({
          mediaId,
          ...read,
          duration: info?.duration ?? read.duration,
        });
        setProgress(null);
        if (result === "errored") {
          setError("The upload didn't arrive. Try again.");
          return false;
        }
        return true;
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : "Upload failed");
        return false;
      }
    },
    [createUpload, completeUpload],
  );
  const uploadNew = useCallback(
    async (
      campaignId: Id<"campaigns">,
      file: Blob,
      finish: (mediaId: Id<"media">) => Promise<void>,
      info?: { duration?: number },
    ) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const mediaId = await start({
          campaignId,
          contentType: videoContentType(file),
        });
        if (!(await upload(mediaId, file, info))) return false;
        await finish(mediaId);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [start, upload],
  );
  return { uploadNew, progress, error, busy };
}
