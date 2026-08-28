import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const consentVersion = "shelvr-waitlist-v1";
const consentText =
  "Notify me when Shelvr launches. One launch email; no newsletter.";

type WaitlistSource = "hero" | "preview" | "footer" | "unknown";

const joinWaitlist = makeFunctionReference<
  "action",
  {
    email: string;
    source: WaitlistSource;
    consentVersion: string;
    consentText: string;
  },
  { saved: boolean; emailProviderSynced: boolean }
>("waitlist:join");

function normalizeSource(value: unknown): WaitlistSource {
  return value === "hero" || value === "preview" || value === "footer"
    ? value
    : "unknown";
}

export async function POST(request: Request) {
  let body: {
    email?: unknown;
    company?: unknown;
    source?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  if (body.company) return NextResponse.json({ ok: true });

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailPattern.test(email) || email.length > 254) {
    return NextResponse.json(
      { message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error("Waitlist is missing CONVEX_URL.");
    return NextResponse.json(
      { message: "The waitlist is being connected. Please try again shortly." },
      { status: 503 },
    );
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.action(joinWaitlist, {
      email,
      source: normalizeSource(body.source),
      consentVersion,
      consentText,
    });

    if (!result.saved) throw new Error("Convex did not confirm the signup.");

    return NextResponse.json({
      ok: true,
      emailProviderSynced: result.emailProviderSynced,
    });
  } catch (error) {
    console.error("Waitlist persistence failed", error);
    return NextResponse.json(
      { message: "Could not join right now. Please try again." },
      { status: 502 },
    );
  }
}
