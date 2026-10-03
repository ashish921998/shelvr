import { signVerdict } from "@/lib/oracleProof";
import type { OracleMode, OracleVerdict } from "@/lib/oracle";
import { NextResponse } from "next/server";

import {
  WAITLIST_CLIENT_IP_HEADER,
  WAITLIST_SECRET_HEADER,
  clientIp,
  forwardErrorCategory,
} from "@/lib/convexForward";
import { convexSiteUrl } from "@/lib/convexSiteUrl";
import { serverLog } from "@/lib/serverLog";
import {
  BodyTooLargeError,
  readBoundedText,
  authorizeRequestBody,
} from "@/lib/requestBody";

// A screenshot verdict may take the full 45 s upstream deadline.
export const maxDuration = 60;

const MAX_BODY_CHARS = 6 * 1024 * 1024;

function message(text: string, status: number) {
  return NextResponse.json({ message: text }, { status });
}

function requestKind(text: string): string | undefined {
  try {
    const body: unknown = JSON.parse(text);
    const kind =
      typeof body === "object" && body !== null
        ? (body as { kind?: unknown }).kind
        : undefined;
    return typeof kind === "string" ? kind : undefined;
  } catch {
    return undefined;
  }
}

/** Forwards the visitor's oracle input to Convex, which validates it. */
export async function POST(request: Request) {
  const refused = await authorizeRequestBody(request, "oracle");
  if (refused) return refused;
  let text: string;
  try {
    text = await readBoundedText(request, MAX_BODY_CHARS);
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? message("That is too big for the oracle.", 413)
      : message("Invalid request.", 400);
  }
  const kind = requestKind(text);
  if (!kind) return message("Invalid request.", 400);

  const siteUrl = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!siteUrl || !secret) {
    serverLog("error", "oracle_unconfigured", {
      has_site_url: siteUrl !== undefined,
      has_shared_secret: Boolean(secret),
    });
    return message("The oracle is still waking up. Try again shortly.", 503);
  }

  try {
    const ip = clientIp(request);
    const response = await fetch(`${siteUrl}/oracle`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WAITLIST_SECRET_HEADER]: secret,
        ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
      },
      body: text,
      signal: AbortSignal.timeout(kind === "screenshot" ? 45_000 : 20_000),
    });

    if (response.status === 429) {
      return message("The oracle needs a breather. Try again in a bit.", 429);
    }
    if (response.status === 400) {
      return message(
        "The oracle could not read that. Check it and retry.",
        400,
      );
    }
    if (!response.ok) {
      throw new Error(`Convex oracle endpoint returned ${response.status}.`);
    }
    const verdict = (await response.json()) as OracleVerdict;
    const shareCode = await signVerdict({
      ...verdict,
      mode: kind as OracleMode,
    });
    return NextResponse.json({ ...verdict, shareCode });
  } catch (error) {
    serverLog("error", "oracle_request_failed", {
      kind,
      error_category: forwardErrorCategory(error),
    });
    return message("The oracle lost the thread. Try again.", 502);
  }
}
