import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { NextResponse } from "next/server";

import { clientIp } from "@/lib/clientIp";
import { isLens, type Lens, LENSES, type RoastHeat } from "@/lib/reveal/lenses";
import { PROMPTS } from "@/lib/reveal/prompts";
import { REVEAL_OUTPUT_SCHEMAS, revealSchema } from "@/lib/reveal/schema";
import { serverLog } from "@/lib/serverLog";

export const maxDuration = 60;

const MODEL_NAME = "gemini-3.1-flash-lite";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
// Vercel rejects request bodies over 4.5 MB before this code runs.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
// ponytail: per warm instance only, so a visitor spread across instances gets
// more; the Vercel WAF rate rule on /api/reveal is the real control.
const recentByIp = new Map<string, number[]>();

function rateLimited(ip: string, now: number): boolean {
  if (recentByIp.size > 10_000) recentByIp.clear();
  const recent = (recentByIp.get(ip) ?? []).filter(
    (at) => now - at < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT) {
    recentByIp.set(ip, recent);
    return true;
  }
  recentByIp.set(ip, [...recent, now]);
  return false;
}

type RevealRequest = { lens: Lens; heat: RoastHeat; images: File[] };

function parseForm(form: FormData): RevealRequest | { message: string } {
  const lens = form.get("lens");
  if (!isLens(lens)) return { message: "Unknown reveal." };
  const { minImages, maxImages } = LENSES[lens];

  const images = form.getAll("images");
  if (images.length < minImages || images.length > maxImages) {
    return {
      message: `Pick ${minImages === maxImages ? minImages : `${minImages} to ${maxImages}`} screenshots.`,
    };
  }
  let total = 0;
  for (const image of images) {
    if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type)) {
      return { message: "Screenshots must be JPEG, PNG, or WebP images." };
    }
    if (image.size > MAX_FILE_BYTES) {
      return { message: "One of those screenshots is too large." };
    }
    total += image.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return { message: "Those screenshots are too large together." };
  }

  const heat = form.get("heat") === "spicy" ? "spicy" : "gentle";
  return { lens, heat, images: images as File[] };
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Invalid request.");
  }
  const parsed = parseForm(form);
  if ("message" in parsed) return badRequest(parsed.message);
  const { lens, heat, images } = parsed;

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    serverLog("error", "reveal_unconfigured", { lens });
    return NextResponse.json(
      { message: "Reveals are warming up. Please try again shortly." },
      { status: 503 },
    );
  }

  if (rateLimited(clientIp(request) ?? "unknown", Date.now())) {
    return NextResponse.json(
      { message: "That's a lot of reveals. Try again in a few minutes." },
      { status: 429 },
    );
  }

  try {
    const files = await Promise.all(
      images.map(async (image) => ({
        type: "file" as const,
        data: new Uint8Array(await image.arrayBuffer()),
        mediaType: image.type,
      })),
    );
    const { object } = await generateObject({
      model: google(MODEL_NAME),
      schema: REVEAL_OUTPUT_SCHEMAS[lens],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(45_000),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: PROMPTS[lens]({ heat, imageCount: images.length }),
            },
            ...files,
          ],
        },
      ],
    });
    // Parsing through the union adds the lens and drops `heat` from every
    // lens but roast.
    const reveal = revealSchema.parse({ ...object, lens, heat });
    return NextResponse.json({ reveal });
  } catch (error) {
    serverLog("error", "reveal_failed", {
      lens,
      error_category: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { message: "We couldn't read those screenshots. Please try again." },
      { status: 502 },
    );
  }
}
