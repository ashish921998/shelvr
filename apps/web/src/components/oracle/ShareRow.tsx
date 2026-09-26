"use client";

import { useEffect, useMemo, useState } from "react";

import { captureWebAnalyticsEvent } from "@/lib/analytics";
import type { OracleMode, OracleVerdict } from "@/lib/oracle";
import { encodeSharedVerdict, sharedVerdictImagePath } from "@/lib/oracleShare";

const IMAGE_NAME = "shelvr-oracle.png";

const buttonClass =
  "min-h-12 w-full rounded-xl border border-line-strong bg-white px-5 text-base font-semibold text-ink transition hover:border-ember-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-auto";

/** Shares the verdict as its story card image where the browser can attach
 * files, and as a link to its share page otherwise. `onShared` fires once the
 * visitor has shared, copied, or saved it. */
export default function ShareRow({
  mode,
  verdict,
  onShared,
}: {
  mode: OracleMode;
  verdict: OracleVerdict;
  onShared?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState<File>();
  const code = useMemo(
    () =>
      encodeSharedVerdict({
        mode,
        persona: verdict.persona,
        tagline: verdict.tagline,
        spaces: verdict.spaces,
        score: verdict.score,
      }),
    [mode, verdict],
  );
  const imagePath = sharedVerdictImagePath(code, "story");

  // Safari only shares inside the tap's user activation, so the card is
  // fetched ahead of the tap rather than after it.
  useEffect(() => {
    const controller = new AbortController();
    fetch(imagePath, { signal: controller.signal })
      .then((response) => (response.ok ? response.blob() : undefined))
      .then((blob) => {
        if (blob) setImage(new File([blob], IMAGE_NAME, { type: "image/png" }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [imagePath]);

  function shared(method: string) {
    captureWebAnalyticsEvent("oracle_shared", { mode, method });
    onShared?.();
  }

  async function share() {
    const text = `The Shelvr Oracle says I'm ${verdict.persona}. What are you?`;
    // The link opens this verdict's own page, whose preview card shows it.
    const url = `${window.location.origin}/oracle/s?c=${code}`;
    if (typeof navigator.share === "function") {
      const files = image ? [image] : undefined;
      const withImage = files !== undefined && navigator.canShare?.({ files });
      try {
        await navigator.share(
          withImage
            ? { title: "The Shelvr Oracle", text: `${text} ${url}`, files }
            : { title: "The Shelvr Oracle", text, url },
        );
        shared(withImage ? "web_share_image" : "web_share");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      shared("clipboard");
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button type="button" onClick={share} className={buttonClass}>
        <span aria-live="polite">
          {copied ? "Copied. Go on, post it." : "Share my verdict"}
        </span>
      </button>
      <a
        href={imagePath}
        download={IMAGE_NAME}
        onClick={() => shared("save_image")}
        className={`${buttonClass} inline-flex items-center justify-center`}
      >
        Save image
      </a>
    </>
  );
}
