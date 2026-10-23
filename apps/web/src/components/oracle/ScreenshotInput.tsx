"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import type { OracleInputProps } from "@/lib/oracle";

import { FieldHint, SubmitButton } from "./OracleFields";

// The picked file is shrunk to a JPEG before it is sent, so this only keeps decoding bounded.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE_PX = 2000;
// Matches ORACLE_MAX_IMAGE_BASE64_CHARS in apps/native/convex/model/oracle.ts.
const MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;

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
  const [preview, setPreview] = useState<string>();

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
      setPreview(undefined);
      setError("That one is over 20 MB. Try a smaller screenshot.");
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setPreparing(true);
    try {
      const imageBase64 = await encodeImage(file);
      if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
        setError(
          "That one is too big for the oracle. Try a smaller screenshot.",
        );
        return;
      }
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
          {preview ? "Tap to pick another" : "JPEG, PNG, or WebP, up to 20 MB"}
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
