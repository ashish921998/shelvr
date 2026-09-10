import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistSource = "hero" | "footer" | "unknown";

type JoinWaitlistResult = { saved: boolean; emailProviderSynced: boolean };

// Must match the header names in apps/native/convex/http.ts.
const WAITLIST_SECRET_HEADER = "x-waitlist-secret";
const WAITLIST_CLIENT_IP_HEADER = "x-shelvr-client-ip";

function normalizeSource(value: unknown): WaitlistSource {
  return value === "hero" || value === "footer" ? value : "unknown";
}

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  const ip = fromForwarded || request.headers.get("x-real-ip")?.trim() || "";
  return ip.length > 0 && ip.length <= 64 ? ip : undefined;
}

/**
 * Base URL of the Convex deployment's HTTP actions. `CONVEX_SITE_URL` wins
 * when set; otherwise derive it from `CONVEX_URL` (`*.convex.cloud` serves
 * functions, the matching `*.convex.site` serves HTTP actions).
 */
function convexSiteUrl(): string | undefined {
  const explicit = process.env.CONVEX_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const cloud = process.env.CONVEX_URL?.trim();
  if (!cloud || !cloud.includes(".convex.cloud")) return undefined;
  return cloud.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

export async function POST(request: Request) {
  let body: { email?: unknown; company?: unknown; source?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  // A hidden honeypot lets ordinary bots succeed without persisting anything.
  if (body.company) return NextResponse.json({ ok: true });

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailPattern.test(email) || email.length > 254) {
    return NextResponse.json(
      { message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const siteUrl = convexSiteUrl();
  const secret = process.env.WAITLIST_SHARED_SECRET;
  if (!siteUrl || !secret) {
    console.error(
      "Android waitlist is missing CONVEX_URL/CONVEX_SITE_URL or WAITLIST_SHARED_SECRET.",
    );
    return NextResponse.json(
      { message: "The waitlist is being connected. Please try again shortly." },
      { status: 503 },
    );
  }

  try {
    // The Convex HTTP action authenticates this server with the shared secret
    // and reads the visitor IP from a dedicated header, so the per-IP rate
    // limit applies to the real client rather than to this server.
    const ip = clientIp(request);
    const response = await fetch(`${siteUrl}/waitlist/join`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WAITLIST_SECRET_HEADER]: secret,
        ...(ip ? { [WAITLIST_CLIENT_IP_HEADER]: ip } : {}),
      },
      body: JSON.stringify({
        email,
        product: "shelvr-android",
        source: normalizeSource(body.source),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { message: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
    if (response.status === 400) {
      return NextResponse.json(
        { message: "Enter a valid email address." },
        { status: 400 },
      );
    }
    if (!response.ok) {
      throw new Error(`Convex waitlist endpoint returned ${response.status}.`);
    }

    const result = (await response.json()) as Partial<JoinWaitlistResult>;
    if (result.saved !== true) {
      throw new Error("Convex did not confirm the signup.");
    }

    return NextResponse.json({
      ok: true,
      emailProviderSynced: result.emailProviderSynced === true,
    });
  } catch (error) {
    // Log name and message only (never the error object): our own messages
    // above carry just a status, and fetch/timeout errors carry no body.
    console.error(
      "Android waitlist persistence failed",
      error instanceof Error ? `${error.name}: ${error.message}` : typeof error,
    );
    return NextResponse.json(
      { message: "Could not join right now. Please try again." },
      { status: 502 },
    );
  }
}
