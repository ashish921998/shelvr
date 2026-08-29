import { v, type Infer } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import {
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  itemStatusValidator,
  productValidator,
  productsStatusValidator,
} from "./itemFields";

/** Validates classifier output persisted when item processing finishes. */
export const finalizeItemArgsValidator = v.object({
  itemId: v.id("items"),
  title: v.string(),
  description: v.string(),
  tags: v.array(v.string()),
  content: v.optional(v.string()),
  siteName: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  aspectRatio: v.optional(v.number()),
  intents: v.optional(v.array(intentValidator)),
  status: itemStatusValidator,
  enrichment: v.optional(enrichmentValidator),
});

/** Validates an image aspect ratio backfill for one item. */
export const setAspectRatioInternalArgsValidator = v.object({
  itemId: v.id("items"),
  aspectRatio: v.number(),
});

/** Validates product-search results and their lifecycle state. */
export const setProductsInternalArgsValidator = v.object({
  itemId: v.id("items"),
  products: v.optional(v.array(productValidator)),
  productsStatus: productsStatusValidator,
});

/** Validates the stable failure reason recorded for one item. */
export const failItemArgsValidator = v.object({
  itemId: v.id("items"),
  reason: failureReasonValidator,
});

function buildItemSearchText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
}): string {
  return [parts.title, parts.description, ...parts.tags, parts.siteName]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join(" ")
    .toLowerCase();
}

/** Persist classifier output and clear the previous item failure reason. */
export async function finalizeItemHandler(
  ctx: MutationCtx,
  args: Infer<typeof finalizeItemArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;

  const searchText = buildItemSearchText({
    title: args.title,
    description: args.description,
    tags: args.tags,
    siteName: args.siteName,
  });
  await ctx.db.patch(args.itemId, {
    title: args.title,
    description: args.description,
    tags: args.tags,
    content: args.content,
    siteName: args.siteName,
    heroImageUrl: args.heroImageUrl,
    aspectRatio: args.aspectRatio,
    intents: args.intents,
    status: args.status,
    enrichment: args.enrichment,
    failureReason: undefined,
    searchText,
  });
  return null;
}

/** Persist a computed image aspect ratio when the target item still exists. */
export async function setAspectRatioInternalHandler(
  ctx: MutationCtx,
  args: Infer<typeof setAspectRatioInternalArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, { aspectRatio: args.aspectRatio });
  return null;
}

/** Persist product-search results without erasing prior results on status-only updates. */
export async function setProductsInternalHandler(
  ctx: MutationCtx,
  args: Infer<typeof setProductsInternalArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, {
    ...(args.products !== undefined ? { products: args.products } : {}),
    productsStatus: args.productsStatus,
  });
  return null;
}

/** Mark one item failed with a stable user-facing failure category. */
export async function failItemHandler(
  ctx: MutationCtx,
  args: Infer<typeof failItemArgsValidator>,
): Promise<null> {
  const item = await ctx.db.get(args.itemId);
  if (item === null) return null;
  await ctx.db.patch(args.itemId, {
    status: "failed",
    failureReason: args.reason,
  });
  return null;
}
