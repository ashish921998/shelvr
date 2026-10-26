import { NextResponse } from "next/server";

import {
  WAITLIST_CLIENT_IP_HEADER,
  WAITLIST_SECRET_HEADER,
  clientIp,
  forwardErrorCategory,
} from "@/lib/convexForward";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { parseReelLink, parseReelPlaces } from "@/lib/reelPlaces";
import {
  BodyTooLargeError,
  authorizeRequestBody,
  readBoundedText,
} from "@/lib/requestBody";
import { serverLog } from "@/lib/serverLog";

export const maxDuration = 60;

const MAX_BODY_CHARS = 4 * 1024;

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status });
}

export async function POST(request: Request) {
  const refused = await authorizeRequestBody(request, "reel-places");
  if (refused) return refused;
  let url: string | undefined;
  try {
    const body: unknown = JSON.parse(
      await readBoundedText(request, MAX_BODY_CHARS),
    );
    url = parseReelLink(
      typeof body === "object" && body !== null
        ? String((body as { url?: unknown }).url ?? "")
        : "",
    );
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? message("That is too big.", 413)
      : message("Invalid request.", 400);
  }
  if (!url) return message("Invalid request.", 400);

  const siteUrl = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!siteUrl || !secret) {
    serverLog("error", "reel_places_unconfigured", {
      has_site_url: siteUrl !== undefined,
      has_shared_secret: Boolean(secret),
    });
    return message("The finder is still waking up. Try again shortly.", 503);
  }

  try {
    const ip = clientIp(request);
    const response = await fetch(`${siteUrl}/reel-places`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WAITLIST_SECRET_HEADER]: secret,
        ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429) {
      return message("The finder needs a breather. Try again in a bit.", 429);
    }
    if (response.status === 400 || response.status === 422) {
      return message("That link could not be read.", 422);
    }
    if (!response.ok) {
      throw new Error(
        `Convex reel places endpoint returned ${response.status}.`,
      );
    }
    const found = parseReelPlaces(await response.json());
    if (!found) throw new Error("Convex reel places answer was malformed.");
    return NextResponse.json(found);
  } catch (error) {
    serverLog("error", "reel_places_request_failed", {
      error_category: forwardErrorCategory(error),
    });
    return message("The finder lost the thread. Try again.", 502);
  }
}
