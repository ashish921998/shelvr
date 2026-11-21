"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useUpload } from "@/lib/useUpload";

export default function UploadVideo({
  campaignId,
}: {
  campaignId: Id<"campaigns">;
}) {
  const create = useMutation(api.videos.create);
  const { uploadNew, progress, error, busy } = useUpload();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    await uploadNew(campaignId, file, async (mediaId) => {
      const videoId = await create({ campaignId, title, mediaId });
      router.push(`/videos/${videoId}`);
    });
  }

  if (file === null) {
    return (
      <>
        <input
          ref={input}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            setTitle(picked ? picked.name.replace(/\.[^.]+$/, "") : "");
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Upload video
        </button>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-56 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-orange-400"
      />
      {!busy ? (
        <>
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black"
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
        <ProgressBar value={progress ?? 0} />
      )}
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-orange-400 transition-all"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      {Math.round(value * 100)}%
    </div>
  );
}
