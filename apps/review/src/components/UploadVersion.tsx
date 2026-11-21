"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useUpload } from "@/lib/useUpload";
import { ProgressBar } from "./UploadVideo";

export default function UploadVersion({
  videoId,
  campaignId,
}: {
  videoId: Id<"videos">;
  campaignId: Id<"campaigns">;
}) {
  const addVersion = useMutation(api.videos.addVersion);
  const { uploadNew, progress, error, busy } = useUpload();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    const ok = await uploadNew(campaignId, file, async (mediaId) => {
      await addVersion({ videoId, mediaId, note });
    });
    if (ok) {
      setFile(null);
      setNote("");
    }
  }

  if (file === null) {
    return (
      <>
        <input
          ref={input}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="btn-primary py-1.5"
        >
          Upload new version
        </button>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What changed? (optional)"
        className="field w-56 py-1.5"
      />
      {!busy ? (
        <>
          <button type="submit" className="btn-primary py-1.5">
            Upload
          </button>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="btn-ghost py-1.5"
          >
            Cancel
          </button>
        </>
      ) : (
        <ProgressBar value={progress ?? 0} />
      )}
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}
