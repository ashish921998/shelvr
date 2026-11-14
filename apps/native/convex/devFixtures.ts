import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  isDevelopmentAnonymousUser,
  liveOwner,
  authedMutation,
} from "./model/auth";
import { CITY_STAMP_CITIES } from "./model/cityStamps";
import { fakeAiLocks } from "./model/fakeAi";
import { insertMembership } from "./model/memberships";
import {
  departMember,
  inviteToken,
  listMembers,
  listPlaces,
  MAX_LISTS_PER_USER,
} from "./model/sharedLists";
import { buildTrip, type TripCandidate } from "./model/trip";
import { safeDeleteStorage } from "./model/storage";
import { deleteTripsForSpace } from "./tripData";

const RESET_LIMIT = 200;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const FIXTURE_PARTNER = "Priya Sharma";
const FIXTURE_CITY = "Austin";

const COFFEE_PIN = {
  name: "Jo's Coffee",
  lat: 30.2502,
  lng: -97.7496,
  city: FIXTURE_CITY,
};
const BAKERY_PIN = {
  name: "Houndstooth Coffee",
  lat: 30.2684,
  lng: -97.7432,
  city: FIXTURE_CITY,
};

const PARTNER_PLACES = [
  {
    name: "Franklin Barbecue",
    lat: 30.2701,
    lng: -97.7313,
    category: "Restaurant",
    hoursAgo: 3,
  },
  {
    name: "Barton Springs Pool",
    lat: 30.264,
    lng: -97.7713,
    category: "Park",
    hoursAgo: 2,
  },
  {
    name: "Uchi",
    lat: 30.2577,
    lng: -97.7612,
    category: "Restaurant",
    hoursAgo: 1,
  },
];

const LIVE_PARTNER_PLACES = [
  {
    name: "Veracruz All Natural",
    lat: 30.2563,
    lng: -97.7234,
    category: "Restaurant",
  },
  { name: "Zilker Park", lat: 30.2669, lng: -97.7729, category: "Park" },
  {
    name: "Torchy's Tacos",
    lat: 30.2466,
    lng: -97.7509,
    category: "Restaurant",
  },
];

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

export const resetCurrentUser = authedMutation({
  args: {},
  returns: resetResultValidator,
  handler: async (ctx) => {
    const { userId } = ctx;
    await requireDevelopmentAnonymousUser(ctx, userId);
    return await seedFixtures(ctx, userId);
  },
});

const BACKEND_RESET_ACCOUNTS = 25;

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
  const [
    memberships,
    operations,
    items,
    spaces,
    subscriptions,
    removals,
    cityStamps,
    visits,
  ] = await Promise.all([
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
    ctx.db
      .query("placeRemovals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(RESET_LIMIT + 1),
    ctx.db
      .query("cityStamps")
      .withIndex("by_user_and_city", (q) => q.eq("userId", userId))
      .take(RESET_LIMIT + 1),
    ctx.db
      .query("placeVisits")
      .withIndex("by_user_and_visited", (q) => q.eq("userId", userId))
      .take(RESET_LIMIT + 1),
  ]);

  for (const [name, count] of [
    ["memberships", memberships.length],
    ["operations", operations.length],
    ["items", items.length],
    ["spaces", spaces.length],
    ["removals", removals.length],
    ["city stamps", cityStamps.length],
    ["visits", visits.length],
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
  await clearFixtureLists(ctx, userId);

  const storageIds = new Set<Id<"_storage">>();
  for (const item of items) {
    if (item.storageId !== undefined) storageIds.add(item.storageId);
  }
  for (const operation of operations) {
    if (operation.storageId !== undefined) storageIds.add(operation.storageId);
  }

  for (const row of removals) await ctx.db.delete(row._id);
  for (const row of cityStamps) await ctx.db.delete(row._id);
  for (const row of visits) await ctx.db.delete(row._id);
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
    cities: ["Lisbon"],
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

  for (const [fixtureKey, title, placePins] of [
    ["austin-coffee", "Austin coffee stops", [COFFEE_PIN, BAKERY_PIN]],
    ["austin-favorites", "Austin favorites", [COFFEE_PIN]],
  ] as const) {
    await ctx.db.insert("items", {
      userId,
      fixtureKey,
      title,
      type: "link",
      status: "ready",
      url: `https://example.com/places/${fixtureKey}`,
      tags: ["coffee"],
      cities: ["Austin"],
      places: placePins.map((pin) => pin.name),
      placePins: [...placePins],
      searchText: `${title} Austin Jo's Coffee Houndstooth Coffee`,
    });
  }

  await ctx.db.insert("items", {
    userId,
    fixtureKey: "houston-eats",
    title: "Houston eats",
    type: "link",
    status: "ready",
    url: "https://example.com/places/houston-eats",
    tags: ["food"],
    cities: ["Houston"],
    places: ["Lucy's", "Marlowe's"],
    placeCuisines: [
      { name: "Lucy's", cuisine: "burger" },
      { name: "Marlowe's", cuisine: "cocktails" },
    ],
    placePins: [
      {
        name: "Lucy's",
        lat: 29.7499,
        lng: -95.3584,
        city: "Houston",
        category: "Restaurant",
        cuisine: "burger",
      },
      {
        name: "Marlowe's",
        lat: 29.7604,
        lng: -95.3698,
        city: "Houston",
        cuisine: "cocktails",
      },
    ],
    searchText: "Houston eats Houston Lucy's Marlowe's",
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
  await seedFixtureList(ctx, userId);
  await ctx.db.insert("subscriptions", {
    userId,
    status: "lifetime",
    expiresAt: 0,
    productId: "dev.flow-fixtures",
    updatedAt: Date.now(),
  });
  for (const city of ["austin", "lisbon", "madrid"] as const) {
    await ctx.db.insert("cityStamps", {
      userId,
      city,
      country: CITY_STAMP_CITIES[city].country,
      stampedAt: Date.now(),
    });
  }

  return { items: 7, spaces: 3, memberships: 4 };
}

async function fixtureItem(
  ctx: QueryCtx,
  userId: Id<"users">,
  fixtureKey: string,
): Promise<Id<"items">> {
  const items = await ctx.db
    .query("items")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(RESET_LIMIT);
  const item = items.find((row) => row.fixtureKey === fixtureKey);
  if (item === undefined) {
    throw new Error(`Development fixture item missing: ${fixtureKey}`);
  }
  return item._id;
}

async function isFixturePartner(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (user === null || user.name !== FIXTURE_PARTNER) return false;
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .first();
  return account === null;
}

async function fixturePartnerOf(
  ctx: QueryCtx,
  listId: Id<"sharedLists">,
): Promise<Id<"users"> | null> {
  for (const member of await listMembers(ctx, listId)) {
    if (await isFixturePartner(ctx, member.userId)) return member.userId;
  }
  return null;
}

async function clearFixtureLists(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const memberships = await ctx.db
    .query("sharedListMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_LISTS_PER_USER + 1);
  if (memberships.length > MAX_LISTS_PER_USER) {
    throw new Error(
      `Development fixture reset refused: shared lists exceed ${MAX_LISTS_PER_USER} rows`,
    );
  }
  for (const membership of memberships) {
    const list = await ctx.db.get(membership.listId);
    if (list === null) await ctx.db.delete(membership._id);
    else await leaveOrDeleteFixtureList(ctx, list, userId);
  }
}

async function leaveOrDeleteFixtureList(
  ctx: MutationCtx,
  list: Doc<"sharedLists">,
  userId: Id<"users">,
): Promise<void> {
  const members = await listMembers(ctx, list._id);
  const partners: Id<"users">[] = [];
  for (const member of members) {
    if (member.userId === userId) continue;
    if (!(await isFixturePartner(ctx, member.userId))) {
      await departMember(ctx, list, userId);
      return;
    }
    partners.push(member.userId);
  }
  for (const place of await listPlaces(ctx, list._id)) {
    await ctx.db.delete(place._id);
  }
  for (const member of members) await ctx.db.delete(member._id);
  await ctx.db.delete(list._id);
  for (const partner of partners) await ctx.db.delete(partner);
}

async function seedFixtureList(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const now = Date.now();
  const itemId = await fixtureItem(ctx, userId, "austin-coffee");
  const partnerId = await ctx.db.insert("users", { name: FIXTURE_PARTNER });
  const ownPins = [COFFEE_PIN, BAKERY_PIN];
  const listId = await ctx.db.insert("sharedLists", {
    ownerId: userId,
    name: "Date night spots",
    cities: [FIXTURE_CITY],
    inviteToken: inviteToken(),
    placeCount: ownPins.length + PARTNER_PLACES.length,
    createdAt: now - 2 * DAY_MS,
  });
  await ctx.db.insert("sharedListMembers", {
    listId,
    userId,
    joinedAt: now - 2 * DAY_MS,
    seenAt: now - DAY_MS,
  });
  await ctx.db.insert("sharedListMembers", {
    listId,
    userId: partnerId,
    joinedAt: now - 2 * DAY_MS + MINUTE_MS,
    seenAt: now,
  });
  for (const pin of ownPins) {
    await ctx.db.insert("sharedListPlaces", {
      listId,
      addedBy: userId,
      itemId,
      ...pin,
      addedAt: now - 2 * DAY_MS,
    });
  }
  for (const { hoursAgo, ...place } of PARTNER_PLACES) {
    await ctx.db.insert("sharedListPlaces", {
      listId,
      addedBy: partnerId,
      ...place,
      city: FIXTURE_CITY,
      addedAt: now - hoursAgo * HOUR_MS,
    });
  }
}

export const simulateSharedListActivity = internalMutation({
  args: { listId: v.id("sharedLists") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const list = await ctx.db.get(args.listId);
    if (list === null) return null;
    if ((await liveOwner(ctx, list.ownerId)) === null) return null;
    if (!(await isDevelopmentAnonymousUser(ctx, list.ownerId))) return null;
    const partnerId = await fixturePartnerOf(ctx, list._id);
    if (partnerId === null) return null;
    const onList = new Set(
      (await listPlaces(ctx, list._id)).map((place) => place.name),
    );
    const next = LIVE_PARTNER_PLACES.find((place) => !onList.has(place.name));
    if (next === undefined) return null;
    await ctx.db.insert("sharedListPlaces", {
      listId: list._id,
      addedBy: partnerId,
      ...next,
      city: FIXTURE_CITY,
      addedAt: Date.now(),
    });
    await ctx.db.patch(list._id, { placeCount: list.placeCount + 1 });
    return next.name;
  },
});

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
