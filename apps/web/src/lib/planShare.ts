import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

export type PlanSharePlace = {
  key: string;
  name: string;
  area?: string;
  why: string;
  imageUrl?: string;
};

type PlanShare = {
  senderName?: string;
  city?: string;
  expiresAt: number;
  places: PlanSharePlace[];
};

type PlanShareOutcome = "found" | "missing" | "unavailable";

export async function loadPlanShare(
  token: string,
): Promise<{ outcome: PlanShareOutcome; share?: PlanShare }> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return { outcome: "unavailable" };

  try {
    const response = await fetch(
      `${siteUrl}/plan/shares/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) {
      serverLog("error", "plan_share_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    return { outcome: "found", share: (await response.json()) as PlanShare };
  } catch (error) {
    serverLog("error", "plan_share_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export function planTitle(share: PlanShare | undefined): string {
  const owner = share?.senderName
    ? `${share.senderName}’s shortlist`
    : "A shortlist";
  return share?.city ? `${owner} for ${share.city}` : owner;
}
