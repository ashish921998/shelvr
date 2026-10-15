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

const MAX_KEYS = 10;

function keyList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_KEYS) return undefined;
  return value.every((key) => typeof key === "string" && key.length <= 8)
    ? (value as string[])
    : undefined;
}

function shortString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 64
    ? value
    : undefined;
}

/**
 * A visitor's ✓ / ✕ picks on a plan vote link. Forwarded to Convex with the
 * shared secret and the visitor IP, so the per-IP limit there applies to the
 * real client rather than to this server.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await readBoundedText(request, 2048));
  } catch (error) {
    return NextResponse.json(
      { message: "Invalid request." },
      { status: error instanceof BodyTooLargeError ? 413 : 400 },
    );
  }
  const fields =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const token = shortString(fields.token);
  const voterId = shortString(fields.voterId);
  const picks = keyList(fields.picks);
  const passes = keyList(fields.passes);
  if (!token || !voterId || !picks || !passes) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
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
      body: JSON.stringify({ token, voterId, picks, passes }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return NextResponse.json({ ok: true });
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
