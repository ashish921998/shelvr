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
