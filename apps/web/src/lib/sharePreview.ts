import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

type SharePreview = {
  type: "image" | "link" | "note";
  title: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  noteText?: string;
  senderName?: string;
};

export type SharePreviewOutcome = "found" | "missing" | "unavailable";

/** Why a share page has no preview: a closed link, or a backend that didn't answer. */
export function missingNote(outcome: SharePreviewOutcome): string | undefined {
  if (outcome === "unavailable") {
    return " This save didn’t load. Try again in a moment.";
  }
  if (outcome === "missing") {
    return " This save may have moved or is no longer shared.";
  }
  return undefined;
}

export async function loadSharePreview(
  token: string,
): Promise<{ outcome: SharePreviewOutcome; preview?: SharePreview }> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return { outcome: "unavailable" };

  try {
    const response = await fetch(
      `${siteUrl}/share/links/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) {
      serverLog("error", "share_preview_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    return {
      outcome: "found",
      preview: (await response.json()) as SharePreview,
    };
  } catch (error) {
    serverLog("error", "share_preview_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export async function fetchSharePreview(
  token: string,
): Promise<SharePreview | undefined> {
  return (await loadSharePreview(token)).preview;
}
