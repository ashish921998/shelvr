import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { env, mutation, type MutationCtx } from "./_generated/server";
import { isDevelopmentAnonymousUser, requireUserId } from "./model/auth";
import { safeDeleteStorage } from "./model/storage";

const RESET_LIMIT = 200;

const resetResultValidator = v.object({
  items: v.number(),
  spaces: v.number(),
  memberships: v.number(),
});

async function requireDevelopmentAnonymousUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (env.AUTH_ENABLE_ANONYMOUS !== "true") {
    throw new Error("Development fixtures are disabled");
  }
  if (!(await isDevelopmentAnonymousUser(ctx, userId))) {
    throw new Error("Development fixtures require an anonymous account");
  }
}

/**
 * Replace the signed-in anonymous developer's app data with a deterministic
 * fixture library. Auth rows are deliberately preserved so the caller remains
 * signed in. The environment and provider checks keep this mutation unusable
 * by production or OAuth accounts.
 */
export const resetCurrentUser = mutation({
  args: {},
  returns: resetResultValidator,
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await requireDevelopmentAnonymousUser(ctx, userId);

    const [memberships, operations, items, spaces, subscriptions] =
      await Promise.all([
        ctx.db
          .query("spaceItems")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(RESET_LIMIT + 1),
        ctx.db
          .query("itemOperations")
          .withIndex("by_user_operation", (q) => q.eq("userId", userId))
          .take(RESET_LIMIT + 1),
        ctx.db
          .query("items")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(RESET_LIMIT + 1),
        ctx.db
          .query("spaces")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(RESET_LIMIT + 1),
        ctx.db
          .query("subscriptions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(2),
      ]);

    for (const [name, count] of [
      ["memberships", memberships.length],
      ["operations", operations.length],
      ["items", items.length],
      ["spaces", spaces.length],
    ] as const) {
      if (count > RESET_LIMIT) {
        throw new Error(
          `Development fixture reset refused: ${name} exceeds ${RESET_LIMIT} rows`,
        );
      }
    }
    if (subscriptions.length > 1) {
      throw new Error(
        "Development fixture reset refused: duplicate subscription rows",
      );
    }

    const storageIds = new Set<Id<"_storage">>();
    for (const item of items) {
      if (item.storageId !== undefined) storageIds.add(item.storageId);
    }
    for (const operation of operations) {
      if (operation.storageId !== undefined)
        storageIds.add(operation.storageId);
    }

    for (const row of memberships) await ctx.db.delete(row._id);
    for (const row of operations) await ctx.db.delete(row._id);
    for (const row of items) await ctx.db.delete(row._id);
    for (const row of spaces) await ctx.db.delete(row._id);
    for (const row of subscriptions) await ctx.db.delete(row._id);
    for (const storageId of storageIds) await safeDeleteStorage(ctx, storageId);

    const ramenId = await ctx.db.insert("items", {
      userId,
      fixtureKey: "ramen",
      type: "link",
      status: "ready",
      title: "Weeknight Miso Ramen",
      description: "A fast, comforting ramen recipe for weeknights.",
      url: "https://example.com/recipes/weeknight-miso-ramen",
      siteName: "Example Kitchen",
      tags: ["recipes", "dinner"],
      intents: [
        {
          kind: "open_url",
          label: "Open recipe",
          value: "https://example.com/recipes/weeknight-miso-ramen",
        },
      ],
      searchText:
        "weeknight miso ramen fast comforting recipe recipes dinner example kitchen",
    });
    const belemId = await ctx.db.insert("items", {
      userId,
      fixtureKey: "belem-tower",
      type: "image",
      status: "ready",
      title: "Belém Tower",
      description: "A saved place in Lisbon.",
      latitude: 38.6916,
      longitude: -9.216,
      capturedAt: 1_700_000_000_000,
      tags: ["travel", "lisbon"],
      searchText: "belém tower saved place lisbon travel",
    });
    const checklistId = await ctx.db.insert("items", {
      userId,
      fixtureKey: "apartment-checklist",
      type: "note",
      status: "ready",
      title: "Apartment Shopping Checklist",
      note: "Lamp, shelves, linen, and a reading chair.",
      tags: ["home", "shopping"],
      searchText:
        "apartment shopping checklist lamp shelves linen reading chair home",
    });
    const craftId = await ctx.db.insert("items", {
      userId,
      fixtureKey: "value-of-craft",
      type: "link",
      status: "ready",
      title: "The Value of Craft",
      description: "Notes on durable objects and thoughtful design.",
      url: "https://example.com/design/value-of-craft",
      siteName: "Example Journal",
      tags: ["design", "reading"],
      searchText:
        "the value of craft durable objects thoughtful design reading example journal",
    });

    const recipesId = await ctx.db.insert("spaces", {
      userId,
      fixtureKey: "recipes",
      name: "Recipes",
      description: "Reliable things to cook again.",
      dynamic: true,
    });
    const tripsId = await ctx.db.insert("spaces", {
      userId,
      fixtureKey: "trips",
      name: "Trips",
      description: "Places worth remembering.",
      dynamic: false,
    });
    const apartmentId = await ctx.db.insert("spaces", {
      userId,
      fixtureKey: "apartment-shopping",
      name: "Apartment Shopping List",
      description: "Things for a warmer home.",
      dynamic: true,
    });

    await ctx.db.insert("spaceItems", {
      userId,
      spaceId: recipesId,
      itemId: ramenId,
      status: "saved",
    });
    await ctx.db.insert("spaceItems", {
      userId,
      spaceId: tripsId,
      itemId: belemId,
      status: "saved",
    });
    await ctx.db.insert("spaceItems", {
      userId,
      spaceId: apartmentId,
      itemId: checklistId,
      status: "saved",
    });
    await ctx.db.insert("spaceItems", {
      userId,
      spaceId: apartmentId,
      itemId: craftId,
      status: "suggested",
    });
    await ctx.db.insert("subscriptions", {
      userId,
      status: "lifetime",
      expiresAt: 0,
      productId: "dev.flow-fixtures",
      updatedAt: Date.now(),
    });

    return { items: 4, spaces: 3, memberships: 4 };
  },
});
