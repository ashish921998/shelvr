import { z } from "zod";

import type { Lens } from "./lenses";

const text = (max: number) => z.string().trim().min(1).max(max);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** What the model writes for each lens. The server adds `lens` (and a roast's
 * `heat`) from the request, so the model never has to echo them back. */
export const REVEAL_OUTPUT_SCHEMAS = {
  era: z.object({
    title: text(80),
    tagline: text(400),
    evidence: z.array(text(200)).min(2).max(4),
  }),
  roast: z.object({
    lines: z.array(text(240)).min(3).max(5),
    closer: text(240),
  }),
  taste: z.object({
    label: text(60),
    description: text(300),
    keywords: z.array(text(40)).min(4).max(6),
    palette: z.array(hexColor).min(4).max(5),
  }),
  find: z.object({
    matches: z
      .array(
        z.object({
          guess: text(120),
          kind: z.enum(["place", "product", "other"]),
          confidence: z.enum(["low", "medium", "high"]),
          check: text(240),
          searchQuery: text(120),
        }),
      )
      .min(1)
      .max(3),
  }),
} satisfies Record<Lens, z.ZodObject>;

export const revealSchema = z.discriminatedUnion("lens", [
  REVEAL_OUTPUT_SCHEMAS.era.extend({ lens: z.literal("era") }),
  REVEAL_OUTPUT_SCHEMAS.roast.extend({
    lens: z.literal("roast"),
    heat: z.enum(["gentle", "spicy"]),
  }),
  REVEAL_OUTPUT_SCHEMAS.taste.extend({ lens: z.literal("taste") }),
  REVEAL_OUTPUT_SCHEMAS.find.extend({ lens: z.literal("find") }),
]);

export type Reveal = z.infer<typeof revealSchema>;
export type RevealOf<L extends Lens> = Extract<Reveal, { lens: L }>;
export type LensTable<T> = { [L in Lens]: (reveal: RevealOf<L>) => T };

/** Dispatches a reveal to its lens's entry in a per-lens table. */
export function byLens<T>(table: LensTable<T>, reveal: Reveal): T {
  return (table[reveal.lens] as (reveal: Reveal) => T)(reveal);
}

const HEADLINES: LensTable<string> = {
  era: (r) => r.title,
  roast: (r) => r.lines[0],
  taste: (r) => r.label,
  find: () => "I found it",
};

export function revealHeadline(reveal: Reveal): string {
  return byLens(HEADLINES, reveal);
}
