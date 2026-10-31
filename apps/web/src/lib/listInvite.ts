import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";

export type ListInvite = {
  inviterName?: string;
  name: string;
  placeCount: number;
  cities: string[];
  placeNames: string[];
};

type ListInviteOutcome = "found" | "missing" | "unavailable";

export async function loadListInvite(
  token: string,
): Promise<{ outcome: ListInviteOutcome; invite?: ListInvite }> {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) return { outcome: "unavailable" };

  try {
    const response = await fetch(
      `${siteUrl}/list/invites/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) {
      serverLog("error", "list_invite_failed", { status: response.status });
      return { outcome: "unavailable" };
    }
    return { outcome: "found", invite: (await response.json()) as ListInvite };
  } catch (error) {
    serverLog("error", "list_invite_failed", {
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return { outcome: "unavailable" };
  }
}

export function inviteHeading(invite: ListInvite | undefined): string {
  return `${invite?.inviterName || "Someone"} wants to save places with you`;
}

export function inviteSummary(invite: ListInvite): string {
  const places = `${invite.placeCount} ${invite.placeCount === 1 ? "place" : "places"}`;
  return invite.cities.length > 0
    ? `${places} · ${invite.cities.join(", ")}`
    : places;
}
