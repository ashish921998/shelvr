"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";

import { FieldHint, SubmitButton } from "./OracleFields";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EDGE_PX = 2000;

/** Re-encodes the image as a JPEG no longer than 2000 px on a side. That keeps
 * a 4 MB camera-roll PNG well under the server's 3 MB cap and the hosting
 * platform's request limit, and still leaves a phone screenshot legible. */
async function encodeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

export default function ScreenshotInput({ busy, onSubmit }: OracleInputProps) {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const preview = useMemo(() => file && URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    setError(undefined);
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      setFile(undefined);
      setError("That one is over 4 MB. Try a smaller screenshot.");
      return;
    }
    setFile(picked);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPreparing(true);
    try {
      const imageBase64 = await encodeImage(file);
      onSubmit({ kind: "screenshot", imageBase64, mediaType: "image/jpeg" });
    } catch {
      setError("Couldn’t read that image. Try a JPEG or PNG.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line-strong bg-white p-4 text-center transition hover:border-ember-deep focus-within:border-ember-deep">
        {preview ? (
          // A local object URL; next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Your screenshot"
            className="max-h-72 w-auto rounded-lg object-contain"
          />
        ) : (
          <span className="text-base font-semibold text-ink">
            Choose a screenshot
          </span>
        )}
        <span className="text-sm text-muted">
          {preview ? "Tap to pick another" : "JPEG, PNG, or WebP, up to 4 MB"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || preparing}
          onChange={pick}
          className="sr-only"
        />
      </label>
      {error ? (
        <FieldHint tone="alert">{error}</FieldHint>
      ) : (
        <FieldHint>Any one will do. The weirder, the better.</FieldHint>
      )}
      <SubmitButton busy={busy || preparing} disabled={!file}>
        Read my screenshot
      </SubmitButton>
    </form>
  );
}
