import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  isDevelopmentAnonymousUser,
  liveOwner,
  requireUserId,
} from "./model/auth";
import { fakeAiLocks } from "./model/fakeAi";
import { insertMembership } from "./model/memberships";
import { buildTrip, type TripCandidate } from "./model/trip";
import { safeDeleteStorage } from "./model/storage";
import { deleteTripsForSpace } from "./tripData";

const RESET_LIMIT = 200;

const resetResultValidator = v.object({
  items: v.number(),
  spaces: v.number(),
  memberships: v.number(),
});

export const canResetCurrentUser = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    if (env.AUTH_ENABLE_ANONYMOUS !== "true") return false;
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    if ((await liveOwner(ctx, userId)) === null) return false;
    return await isDevelopmentAnonymousUser(ctx, userId);
  },
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
    return await seedFixtures(ctx, userId);
  },
});

/** How many anonymous accounts one backend reset may touch. A run makes a
 * handful (the warm-up sign-in, the seeded user, onboarding's fresh ones). */
const BACKEND_RESET_ACCOUNTS = 25;

/**
 * The e2e job's fixture reset, run from the CLI
 * (`convex run devFixtures:resetAnonymousUsersForE2e`) instead of through
 * Settings, which cost each flow about 20 seconds of taps and a relaunch.
 * The runner does not know which anonymous account the app is signed in as,
 * so every live anonymous account gets the fixtures. Only the e2e job's local
 * backend passes the fake model's locks (loopback URL, dev sign-in, the
 * placeholder key, the switch), so no shared deployment can run it. Returns
 * how many accounts were reset.
 */
export const resetAnonymousUsersForE2e = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const locks = fakeAiLocks({
      E2E_FAKE_AI: env.E2E_FAKE_AI,
      AUTH_ENABLE_ANONYMOUS: env.AUTH_ENABLE_ANONYMOUS,
      GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
      CONVEX_CLOUD_URL: process.env.CONVEX_CLOUD_URL,
    });
    if (!locks.enabled) {
      throw new Error(`Backend fixture reset refused: ${locks.refusedBy}`);
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "anonymous"))
      .take(BACKEND_RESET_ACCOUNTS + 1);
    if (accounts.length > BACKEND_RESET_ACCOUNTS) {
      throw new Error(
        `Backend fixture reset refused: more than ${BACKEND_RESET_ACCOUNTS} anonymous accounts`,
      );
    }
    let reset = 0;
    for (const account of accounts) {
      if ((await liveOwner(ctx, account.userId)) === null) continue;
      await requireDevelopmentAnonymousUser(ctx, account.userId);
      await seedFixtures(ctx, account.userId);
      reset++;
    }
    return reset;
  },
});

async function seedFixtures(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ items: number; spaces: number; memberships: number }> {
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
    if (operation.storageId !== undefined) storageIds.add(operation.storageId);
  }

  for (const row of memberships) await ctx.db.delete(row._id);
  for (const row of operations) await ctx.db.delete(row._id);
  for (const row of items) await ctx.db.delete(row._id);
  for (const row of spaces) {
    await deleteTripsForSpace(ctx, row._id);
    await ctx.db.delete(row._id);
  }
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
    // The page loaded but had no extractable article, so the detail
    // screen shows the plain-link layout (site panel and button).
    enrichment: "no_article",
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
    // A readable article body + hero so this fixture exercises the
    // ArticleReaderView path (paragraphs split on blank lines).
    heroImageUrl: "https://picsum.photos/seed/value-of-craft/1200/630",
    aspectRatio: 1.91,
    content: [
      "The objects that stay with us are rarely the ones built to impress at first glance. They are the ones that were assembled with an opinion — a decision about what they should be, made by someone who cared enough to defend it.",
      "Durability is the quiet half of craft. A well-made thing absorbs use without showing it as damage; the patina becomes a record of a life rather than a tally of failures. Mass production struggles here because its economics reward the cheapest acceptable outcome, not the most durable one.",
      "Thoughtful design also knows when to stop. Every feature added to fill a spec sheet is a claim on the user's attention, and attention is the scarcest material any product touches. The discipline is not in what a thing can do, but in what it declines to do.",
      'None of this is nostalgia. New tools, new materials, and new methods all have a place — but the intent behind them is the part that compounds. A workshop that asks "what should this be?" before "how fast can we ship it?" will make objects worth keeping, whatever century it works in.',
    ].join("\n\n"),
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

  await insertMembership(ctx, {
    userId,
    spaceId: recipesId,
    itemId: ramenId,
    status: "saved",
  });
  await insertMembership(ctx, {
    userId,
    spaceId: tripsId,
    itemId: belemId,
    status: "saved",
  });
  await insertMembership(ctx, {
    userId,
    spaceId: apartmentId,
    itemId: checklistId,
    status: "saved",
  });
  await insertMembership(ctx, {
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
}

/**
 * Pins a trip on a development deployment that has no Apple Maps key: sets
 * where each named stop is, as `trips.makeTrip` would have, and lays the trip
 * out again from those points. Internal, so it is run from the CLI
 * (`convex run devFixtures:locateTripStops`), with the fixture reset's guards
 * on the trip's owner. Returns how many stops got a point.
 */
export const locateTripStops = internalMutation({
  args: {
    spaceId: v.id("spaces"),
    places: v.array(
      v.object({ name: v.string(), lat: v.number(), lng: v.number() }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const trip = await ctx.db
      .query("trips")
      .withIndex("by_space", (q) => q.eq("spaceId", args.spaceId))
      .first();
    if (trip === null) throw new Error("Trip not found");
    await requireDevelopmentAnonymousUser(ctx, trip.userId as Id<"users">);
    const points = new Map(
      args.places.map((place) => [place.name.trim().toLowerCase(), place]),
    );
    let located = 0;
    const candidates: TripCandidate[] = [
      ...trip.days.flatMap((day) => day.stops),
      ...trip.wishlist,
    ].map(({ lat: _lat, lng: _lng, ...stop }) => {
      const point = points.get(stop.name.trim().toLowerCase());
      if (point) located++;
      return {
        ...stop,
        ...(point ? { location: { lat: point.lat, lng: point.lng } } : {}),
      };
    });
    const laid = buildTrip(candidates, {
      days: trip.days.length,
      pace: trip.pace,
    });
    await ctx.db.patch(trip._id, laid);
    return located;
  },
});
