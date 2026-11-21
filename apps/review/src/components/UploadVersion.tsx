"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useUpload } from "@/lib/useUpload";
import { ProgressBar } from "./UploadVideo";

export default function UploadVersion({ videoId }: { videoId: Id<"videos"> }) {
  const addVersion = useMutation(api.videos.addVersion);
  const { upload, progress, error } = useUpload();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    const { mediaId } = await addVersion({ videoId, note });
    const ok = await upload(mediaId, file);
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
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black"
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
        className="w-56 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-orange-400"
      />
      {progress === null ? (
        <>
          <button
            type="submit"
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-black"
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="px-2 text-sm text-zinc-400"
          >
            Cancel
          </button>
        </>
      ) : (
        <ProgressBar value={progress} />
      )}
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}
