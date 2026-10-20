import { NextResponse } from "next/server";

import {
  WAITLIST_CLIENT_IP_HEADER,
  WAITLIST_SECRET_HEADER,
  clientIp,
  forwardErrorCategory,
} from "@/lib/convexForward";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";
import { BodyTooLargeError, readBoundedText } from "@/lib/requestBody";

/**
 * A visitor's ✓ / ✕ picks on a plan vote link. Forwarded to Convex with the
 * shared secret and the visitor IP, so the per-IP limit there applies to the
 * real client rather than to this server.
 */
export async function POST(request: Request) {
  // The ballot's shape is read once, in Convex (`model/planVote.ts`); this
  // route only bounds the body and passes it on as it came.
  let body: string;
  try {
    body = await readBoundedText(request, 2048);
  } catch (error) {
    return NextResponse.json(
      { message: "Invalid request." },
      { status: error instanceof BodyTooLargeError ? 413 : 400 },
    );
  }

  const siteUrl = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!siteUrl || !secret) {
    serverLog("error", "plan_vote_unconfigured", {
      has_site_url: siteUrl !== undefined,
      has_shared_secret: Boolean(secret),
    });
    return NextResponse.json(
      { message: "Votes can't be saved right now." },
      { status: 503 },
    );
  }

  try {
    const ip = clientIp(request);
    const response = await fetch(`${siteUrl}/plan/votes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WAITLIST_SECRET_HEADER]: secret,
        ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return NextResponse.json({ ok: true });
    if (response.status === 400) {
      return NextResponse.json(
        { message: "Invalid request." },
        { status: 400 },
      );
    }
    if (response.status === 404) {
      return NextResponse.json(
        { message: "This shortlist has closed." },
        { status: 404 },
      );
    }
    if (response.status === 409) {
      return NextResponse.json(
        { message: "This shortlist has all the votes it can take." },
        { status: 409 },
      );
    }
    if (response.status === 429) {
      return NextResponse.json(
        { message: "Too many votes. Try again in a bit." },
        { status: 429 },
      );
    }
    throw new Error(`Convex plan vote endpoint returned ${response.status}.`);
  } catch (error) {
    serverLog("error", "plan_vote_failed", {
      error_category: forwardErrorCategory(error),
    });
    return NextResponse.json(
      { message: "Couldn't save your vote. Try again." },
      { status: 502 },
    );
  }
}
