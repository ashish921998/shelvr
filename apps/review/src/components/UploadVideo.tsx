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
          className="btn-primary"
        >
          <span className="text-base leading-none">+</span>
          Upload video
        </button>
      </>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="panel flex flex-wrap items-center gap-2 p-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="field w-56"
      />
      {!busy ? (
        <>
          <button type="submit" className="btn-primary">
            Upload
          </button>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="btn-ghost"
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
    <div className="flex items-center gap-2 text-xs tabular-nums text-muted">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      {Math.round(value * 100)}%
    </div>
  );
}
