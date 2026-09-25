"use client";

import { type ChangeEvent, useState } from "react";

import AppStoreButton from "@/components/AppStoreButton";
import { captureWebAnalyticsEvent, captureWebException } from "@/lib/analytics";
import { type Lens, LENSES, type RoastHeat } from "@/lib/reveal/lenses";
import { type Reveal, revealSchema } from "@/lib/reveal/schema";
import { encodeReveal } from "@/lib/reveal/shareCode";

import RevealCard from "./RevealCard";

type Stage =
  | { kind: "pick" }
  | { kind: "uploading" }
  | { kind: "result"; reveal: Reveal }
  | { kind: "error"; message: string };

type Picked = { id: number; file: File; url: string };

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;
const GENERIC_ERROR = "Something went wrong. Please try again.";

let nextPickId = 0;

async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  // JPEG has no alpha; transparent PNG pixels would otherwise turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas encode failed.")),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

type RevealOutcome =
  | { ok: true; reveal: Reveal }
  | { ok: false; status: number | "network" | "decode"; message: string };

async function requestReveal(
  lens: Lens,
  heat: RoastHeat | undefined,
  files: File[],
): Promise<RevealOutcome> {
  const form = new FormData();
  form.set("lens", lens);
  if (heat) form.set("heat", heat);
  try {
    const blobs = await Promise.all(files.map(downscale));
    blobs.forEach((blob, index) =>
      form.append("images", blob, `screenshot-${index + 1}.jpg`),
    );
  } catch (error) {
    captureWebException(error, { lens });
    return {
      ok: false,
      status: "decode",
      message: "One of those images couldn't be read. Try another screenshot.",
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/reveal", { method: "POST", body: form });
  } catch {
    return {
      ok: false,
      status: "network",
      message: "We couldn't reach Shelvr. Check your connection and try again.",
    };
  }
  const body = (await response.json().catch(() => ({}))) as {
    reveal?: unknown;
    message?: unknown;
  };
  const parsed = revealSchema.safeParse(body.reveal);
  if (response.ok && parsed.success) return { ok: true, reveal: parsed.data };
  return {
    ok: false,
    status: response.status,
    message: typeof body.message === "string" ? body.message : GENERIC_ERROR,
  };
}

export default function RevealTool({ lens }: { lens: Lens }) {
  const info = LENSES[lens];
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [picked, setPicked] = useState<Picked[]>([]);
  const [heat, setHeat] = useState<RoastHeat>("gentle");

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    // Clearing the input lets the same file be picked again after a removal.
    event.target.value = "";
    const added = files
      .slice(0, info.maxImages - picked.length)
      .map((file) => ({
        id: nextPickId++,
        file,
        url: URL.createObjectURL(file),
      }));
    setPicked([...picked, ...added]);
    if (stage.kind === "error") setStage({ kind: "pick" });
  };

  const onRemove = (removed: Picked) => {
    URL.revokeObjectURL(removed.url);
    setPicked(picked.filter((pick) => pick.id !== removed.id));
  };

  const onReveal = async () => {
    const started = performance.now();
    const chosenHeat = info.hasHeat ? heat : undefined;
    setStage({ kind: "uploading" });
    captureWebAnalyticsEvent("reveal_started", {
      lens,
      image_count: picked.length,
      ...(chosenHeat ? { heat: chosenHeat } : {}),
    });
    const outcome = await requestReveal(
      lens,
      chosenHeat,
      picked.map((pick) => pick.file),
    );
    if (outcome.ok) {
      captureWebAnalyticsEvent("reveal_completed", {
        lens,
        duration_ms: Math.round(performance.now() - started),
      });
      setStage({ kind: "result", reveal: outcome.reveal });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      captureWebAnalyticsEvent("reveal_failed", {
        lens,
        status: outcome.status,
      });
      setStage({ kind: "error", message: outcome.message });
    }
  };

  if (stage.kind === "result") {
    return (
      <RevealResult
        reveal={stage.reveal}
        onAgain={() => setStage({ kind: "pick" })}
      />
    );
  }

  const uploading = stage.kind === "uploading";
  const enough = picked.length >= info.minImages;
  const full = picked.length >= info.maxImages;
  const range =
    info.minImages === info.maxImages
      ? `${info.minImages}`
      : `${info.minImages} to ${info.maxImages}`;

  return (
    <div className="space-y-5">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line-strong bg-card px-6 py-8 text-center transition hover:border-ember focus-within:border-ember focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${
          full || uploading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={onPick}
          disabled={full || uploading}
        />
        <span className="text-lg font-semibold text-ink">
          {picked.length === 0 ? "Choose screenshots" : "Add more"}
        </span>
        <span className="mt-1 text-sm text-muted">
          {range} images · {picked.length} picked
        </span>
      </label>

      {picked.length > 0 && (
        <ul className="grid grid-cols-3 gap-3">
          {picked.map((pick) => (
            <li
              key={pick.id}
              className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-paper-deep"
            >
              {/* A blob: preview URL cannot go through next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pick.url}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(pick)}
                disabled={uploading}
                aria-label={`Remove ${pick.file.name}`}
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink/80 text-lg leading-none text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {info.hasHeat && (
        <div
          role="radiogroup"
          aria-label="Roast heat"
          className="flex rounded-full border border-line bg-card p-1"
        >
          {(["gentle", "spicy"] as const).map((level) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={heat === level}
              onClick={() => setHeat(level)}
              disabled={uploading}
              className={`min-h-11 flex-1 rounded-full text-sm font-semibold capitalize transition ${
                heat === level ? "bg-ink text-white" : "text-muted"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      )}

      {stage.kind === "error" && (
        <p
          role="alert"
          className="rounded-2xl bg-ember-soft px-4 py-3 text-sm text-ember-deep"
        >
          {stage.message}
        </p>
      )}

      <button
        type="button"
        onClick={onReveal}
        disabled={!enough || uploading}
        className="min-h-14 w-full rounded-2xl bg-ink px-6 text-base font-semibold text-white shadow-card transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <span className="animate-pulse">{info.waitingLine}</span>
        ) : enough ? (
          info.shareVerb
        ) : (
          `Pick ${info.minImages - picked.length} more`
        )}
      </button>

      <p className="text-center text-xs leading-5 text-muted">
        Your screenshots are processed once and never stored. Share cards carry
        only the text.
      </p>
    </div>
  );
}

function RevealResult({
  reveal,
  onAgain,
}: {
  reveal: Reveal;
  onAgain: () => void;
}) {
  const info = LENSES[reveal.lens];
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url = `${window.location.origin}/play/${reveal.lens}/s?c=${encodeReveal(reveal)}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        captureWebAnalyticsEvent("reveal_shared", {
          lens: reveal.lens,
          method: "share",
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      captureWebAnalyticsEvent("reveal_shared", {
        lens: reveal.lens,
        method: "copy",
      });
    } catch (error) {
      captureWebException(error, { lens: reveal.lens });
    }
  };

  return (
    <div className="space-y-6">
      <RevealCard reveal={reveal} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onShare}
          className="min-h-12 flex-1 rounded-2xl bg-ink px-5 text-sm font-semibold text-white transition hover:bg-ink-soft"
        >
          {copied ? "Copied" : "Share"}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="min-h-12 flex-1 rounded-2xl border border-line-strong bg-card px-5 text-sm font-semibold text-ink transition hover:border-ink"
        >
          Try again
        </button>
      </div>
      <div className="rounded-3xl bg-ember-soft px-6 py-8 text-center">
        <p className="display text-2xl leading-snug text-ink">
          {info.installBridge}
        </p>
        <div className="mt-5 flex justify-center">
          <AppStoreButton source="play" campaign={`play_${reveal.lens}`} />
        </div>
      </div>
    </div>
  );
}
