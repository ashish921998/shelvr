"use client";

import { useAction } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { putFile } from "./upload";

export function useUpload() {
  const createUpload = useAction(api.media.createUpload);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useCallback(
    async (mediaId: Id<"media">, file: Blob) => {
      setError(null);
      setProgress(0);
      try {
        const { url } = await createUpload({ mediaId });
        await putFile(url, file, setProgress);
        setProgress(null);
        return true;
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : "Upload failed");
        return false;
      }
    },
    [createUpload],
  );
  return { upload, progress, error };
}
