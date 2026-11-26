import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { authedQuery } from "./model/auth";
import {
  cuisineValidator,
  placeFeatureValidator,
  placeKindValidator,
} from "./model/itemFields";
import { logEvent } from "./model/log";
import { MAX_MAP_PLACES } from "./mapPlaces";
import { boxValidator, discoverPlaces, indexPlace } from "./model/placeIndex";
import {
  cityCentre,
  findVenue,
  inCity,
  reportValidator,
  storedPlaceValidator,
  type StoredPlace,
} from "./model/placeImport";
import { placeKinds } from "./model/placeKinds";
import { distanceKm } from "./model/trip";

const MAX_SOURCES = 3;
const MAX_NAMES = 100;
const REINDEX_PAGE = 50;
const MAX_CATALOG_IMPORT = 100;
const MAX_CATALOG_RESULTS = 20;
const MAX_CATALOG_CANDIDATES = 80;
const MAX_IDENTITY_CANDIDATES = 16;
const IDENTITY_DISTANCE_KM = 0.02;
const MAX_SEARCH_LENGTH = 160;
const MAX_SEARCH_TERMS = 16;

const mapPlaceValidator = v.object({
  _id: v.id("places"),
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  city: v.string(),
  appleId: v.string(),
  category: v.optional(v.string()),
  cuisine: v.optional(cuisineValidator),
  kinds: v.array(v.string()),
  features: v.optional(v.array(placeFeatureValidator)),
});

const catalogPlaceValidator = mapPlaceValidator.omit("appleId").extend({
  appleId: v.optional(v.string()),
  source: v.optional(v.literal("overture")),
});

const placeCard = (row: Doc<"places">) => {
  const category = row.kind ? undefined : row.category;
  return {
    _id: row._id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    ...(category ? { category } : {}),
    ...(row.cuisine ? { cuisine: row.cuisine } : {}),
    kinds: row.kind ? [row.kind] : placeKinds(category, [], row.cuisine),
    ...(row.features ? { features: row.features } : {}),
  };
};

const discoverCards = (rows: Doc<"places">[]) =>
  rows.flatMap((row) =>
    row.status === "live" && row.appleId
      ? [{ ...placeCard(row), appleId: row.appleId }]
      : [],
  );

const searchTerms = (text: string) =>
  text
    .normalize("NFC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];

const foldTerm = (term: string) =>
  term.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");

const matchingNameRank = (name: string, terms: string[], phrase: string) => {
  const words = searchTerms(name).map(foldTerm);
  if (!terms.every((term) => words.some((word) => word.startsWith(term))))
    return null;
  const candidate = words.join(" ");
  if (candidate === phrase) return 0;
  return candidate.startsWith(phrase) ? 1 : 2;
};

export const searchCatalog = authedQuery({
  args: { text: v.string() },
  returns: v.array(catalogPlaceValidator),
  handler: async (ctx, { text }) => {
    if (text.length > MAX_SEARCH_LENGTH) return [];
    const queryTerms = searchTerms(text);
    if (!queryTerms.length) return [];
    const search = queryTerms.slice(0, MAX_SEARCH_TERMS).join(" ");
    const terms = queryTerms.map(foldTerm);
    const phrase = terms.join(" ");

    const groups = await Promise.all(
      (["live", "catalog"] as const).map((status) =>
        ctx.db
          .query("places")
          .withSearchIndex("search_name", (q) =>
            q.search("name", search).eq("status", status),
          )
          .take(MAX_CATALOG_CANDIDATES),
      ),
    );
    return groups
      .flat()
      .flatMap((row) => {
        const rank = matchingNameRank(row.name, terms, phrase);
        return rank === null ? [] : [{ row, rank }];
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_CATALOG_RESULTS)
      .map(({ row }) => ({
        ...placeCard(row),
        ...(row.appleId ? { appleId: row.appleId } : {}),
        ...(row.source ? { source: row.source } : {}),
      }));
  },
});

export const forMap = authedQuery({
  args: {},
  returns: v.array(mapPlaceValidator),
  handler: async (ctx) =>
    discoverCards(
      await ctx.db
        .query("places")
        .withIndex("by_status", (q) => q.eq("status", "live"))
        .take(MAX_MAP_PLACES),
    ),
});

export const inArea = authedQuery({
  args: { box: boxValidator },
  returns: v.object({
    places: v.array(mapPlaceValidator),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { rows, complete } = await discoverPlaces(ctx, args.box);
    return { places: discoverCards(rows), complete };
  },
});

const catalogImportValidator = v.object({
  overtureId: v.string(),
  name: v.string(),
  city: v.string(),
  lat: v.number(),
  lng: v.number(),
  kind: placeKindValidator,
  appleId: v.optional(v.string()),
});

type CatalogImport = Infer<typeof catalogImportValidator>;
type VenueLocation = Pick<Doc<"places">, "city" | "name" | "lat" | "lng">;
type CatalogFacts = Omit<CatalogImport, "appleId" | "overtureId">;

const sameNearbyVenue = (a: VenueLocation, b: VenueLocation) =>
  a.city === b.city &&
  a.name === b.name &&
  distanceKm(a, b) <= IDENTITY_DISTANCE_KM;

const venueBucket = ({ city, name }: VenueLocation) =>
  JSON.stringify([city, name]);

function uniqueInBatch<T extends VenueLocation>(
  places: T[],
  providerId: (place: T) => string,
) {
  const buckets = new Map<string, T[]>();
  for (const place of places) {
    const key = venueBucket(place);
    const bucket = buckets.get(key) ?? [];
    if (bucket.length <= MAX_IDENTITY_CANDIDATES) bucket.push(place);
    buckets.set(key, bucket);
  }
  return (place: T, matched: VenueLocation) => {
    const bucket = buckets.get(venueBucket(place)) ?? [];
    return (
      bucket.length <= MAX_IDENTITY_CANDIDATES &&
      !bucket.some(
        (candidate) =>
          providerId(candidate) !== providerId(place) &&
          sameNearbyVenue(candidate, matched),
      )
    );
  };
}

async function uniqueNearbyVenue(ctx: MutationCtx, place: VenueLocation) {
  const candidates = await ctx.db
    .query("places")
    .withIndex("by_city_and_name", (q) =>
      q.eq("city", place.city).eq("name", place.name),
    )
    .take(MAX_IDENTITY_CANDIDATES + 1);
  if (candidates.length > MAX_IDENTITY_CANDIDATES) return null;
  const nearby = candidates.filter((candidate) =>
    sameNearbyVenue(candidate, place),
  );
  return nearby.length === 1 ? nearby[0] : null;
}

async function findUnlinkedCuratedVenue(
  ctx: MutationCtx,
  place: CatalogImport,
  mayInfer: (place: CatalogImport, matched: VenueLocation) => boolean,
) {
  const nearby = await uniqueNearbyVenue(ctx, place);
  return nearby?.appleId &&
    nearby.status !== "catalog" &&
    !nearby.overtureId &&
    mayInfer(place, nearby)
    ? nearby
    : null;
}

function validateCatalogImport(place: CatalogImport) {
  const bounds = [
    [place.lat, 90],
    [place.lng, 180],
  ] as const;
  const fields = [place.overtureId, place.name, place.city, place.appleId];
  if (
    fields.some(
      (value) =>
        value !== undefined &&
        (!value || value.length > 200 || value !== value.trim()),
    ) ||
    bounds.some(
      ([value, limit]) => !Number.isFinite(value) || Math.abs(value) > limit,
    )
  ) {
    throw new Error("Invalid catalog place");
  }
}

async function reconcileVerifiedPair(
  ctx: MutationCtx,
  curated: Doc<"places">,
  catalog: Doc<"places">,
  overtureId: string,
) {
  if (
    curated.status === "catalog" ||
    curated.overtureId ||
    catalog.status !== "catalog" ||
    catalog.source !== "overture" ||
    catalog.appleId ||
    !sameNearbyVenue(curated, catalog)
  ) {
    throw new Error("Conflicting catalog place identifiers");
  }
  await ctx.db.patch(curated._id, { overtureId });
  await ctx.db.delete(catalog._id);
}

function catalogFacts({ name, city, lat, lng, kind }: CatalogFacts) {
  return { name, city, lat, lng, kind };
}

function catalogFactsChanged(
  a: Omit<CatalogFacts, "kind"> & { kind?: CatalogFacts["kind"] },
  b: CatalogFacts,
) {
  return (
    a.name !== b.name ||
    a.city !== b.city ||
    a.lat !== b.lat ||
    a.lng !== b.lng ||
    a.kind !== b.kind
  );
}

async function restoreInferredVenue(ctx: MutationCtx, row: Doc<"places">) {
  const alias = row.inferredAlias;
  if (alias?.provider === "overture" && row.overtureId) {
    await ctx.db.insert("places", {
      ...catalogFacts(alias),
      overtureId: row.overtureId,
      source: "overture",
      status: "catalog",
      addedAt: row.addedAt,
    });
    await ctx.db.patch(row._id, {
      overtureId: undefined,
      inferredAlias: undefined,
    });
    return;
  }
  if (alias?.provider === "apple" && row.appleId) {
    const curated = {
      name: row.name,
      city: row.city,
      lat: alias.lat,
      lng: alias.lng,
      appleId: row.appleId,
      category: alias.category,
      kind: row.kind,
      cuisine: row.cuisine,
      features: row.features,
      sources: row.sources,
      status: row.status === "hidden" ? ("hidden" as const) : ("live" as const),
      addedAt: row.addedAt,
    };
    const status = row.status === "hidden" ? "hidden" : alias.catalogStatus;
    await ctx.db.patch(row._id, {
      status,
      appleId: undefined,
      kind: alias.catalogKind,
      cuisine: undefined,
      features: undefined,
      sources: undefined,
      inferredAlias: undefined,
    });
    await indexPlace(ctx, { ...row, status });
    const _id = await ctx.db.insert("places", curated);
    await indexPlace(ctx, { ...curated, _id });
    return;
  }
  throw new Error("Invalid inferred place alias");
}

function lookupProviderPair(
  ctx: MutationCtx,
  overtureId: string,
  appleId: string | undefined,
) {
  return Promise.all([
    ctx.db
      .query("places")
      .withIndex("by_overture_id", (q) => q.eq("overtureId", overtureId))
      .unique(),
    appleId === undefined
      ? null
      : ctx.db
          .query("places")
          .withIndex("by_apple_id", (q) => q.eq("appleId", appleId))
          .unique(),
  ] as const);
}

async function resolveProviderPair(
  ctx: MutationCtx,
  { overtureId, appleId }: CatalogImport,
) {
  const pair = await lookupProviderPair(ctx, overtureId, appleId);
  if (!appleId) return pair;
  const [byOverture, byApple] = pair;
  const restoreOverture =
    byOverture?.inferredAlias && byOverture.appleId !== appleId;
  const restoreApple =
    byApple?.inferredAlias && byApple.overtureId !== overtureId;
  if (restoreOverture) await restoreInferredVenue(ctx, byOverture);
  if (restoreApple) await restoreInferredVenue(ctx, byApple);
  return restoreOverture || restoreApple
    ? await lookupProviderPair(ctx, overtureId, appleId)
    : pair;
}

async function applyCatalogImport(
  ctx: MutationCtx,
  row: Doc<"places">,
  place: CatalogImport,
) {
  const { overtureId, appleId } = place;
  const refresh = row.status === "catalog" && catalogFactsChanged(row, place);
  const alias = row.inferredAlias;
  const saveAlias =
    !appleId &&
    (!row.overtureId ||
      (alias?.provider === "overture" && catalogFactsChanged(alias, place)));
  const confirmAlias = Boolean(appleId && alias);
  if (
    refresh ||
    saveAlias ||
    confirmAlias ||
    !row.overtureId ||
    (!row.appleId && appleId)
  ) {
    await ctx.db.patch(row._id, {
      overtureId,
      ...(appleId ? { appleId } : {}),
      ...(refresh ? catalogFacts(place) : {}),
      ...(saveAlias
        ? { inferredAlias: { provider: "overture", ...catalogFacts(place) } }
        : {}),
      ...(confirmAlias ? { inferredAlias: undefined } : {}),
    });
  }
}

async function storeCatalogPlace(
  ctx: MutationCtx,
  place: CatalogImport,
  mayInfer: (place: CatalogImport, matched: VenueLocation) => boolean,
) {
  validateCatalogImport(place);
  const { overtureId, appleId } = place;
  const [byOverture, byApple] = await resolveProviderPair(ctx, place);

  if (byApple && byOverture && byApple._id !== byOverture._id) {
    await reconcileVerifiedPair(ctx, byApple, byOverture, overtureId);
    return false;
  }
  if (
    (byApple?.overtureId && byApple.overtureId !== overtureId) ||
    (appleId && byOverture?.appleId && byOverture.appleId !== appleId)
  ) {
    throw new Error("Conflicting catalog place identifiers");
  }
  const row =
    byOverture ??
    byApple ??
    (!appleId ? await findUnlinkedCuratedVenue(ctx, place, mayInfer) : null);
  if (!row) {
    await ctx.db.insert("places", {
      ...place,
      source: "overture",
      status: "catalog",
      addedAt: Date.now(),
    });
    return true;
  }
  await applyCatalogImport(ctx, row, place);
  return false;
}

export const storeCatalog = internalMutation({
  args: { places: v.array(catalogImportValidator) },
  returns: v.object({ added: v.number(), existing: v.number() }),
  handler: async (ctx, { places }) => {
    if (places.length > MAX_CATALOG_IMPORT)
      throw new Error("Catalog batch is too large");
    const mayInfer = uniqueInBatch(places, (place) => place.overtureId);
    let added = 0;
    for (const place of places)
      if (await storeCatalogPlace(ctx, place, mayInfer)) added++;
    return { added, existing: places.length - added };
  },
});

export const store = internalMutation({
  args: {
    city: v.string(),
    places: v.array(storedPlaceValidator),
    source: v.optional(v.string()),
  },
  returns: v.object({ added: v.number(), existing: v.number() }),
  handler: async (ctx, args) => {
    const places = args.places.map((place) => ({ ...place, city: args.city }));
    const mayInfer = uniqueInBatch(places, (place) => place.appleId);
    let added = 0;
    let existing = 0;
    for (const place of places) {
      let row = await ctx.db
        .query("places")
        .withIndex("by_apple_id", (q) => q.eq("appleId", place.appleId))
        .first();
      if (!row) {
        const nearby = await uniqueNearbyVenue(ctx, place);
        if (
          nearby?.overtureId &&
          nearby.status !== "live" &&
          nearby.source === "overture" &&
          !nearby.appleId &&
          mayInfer(place, nearby)
        ) {
          row = nearby;
        }
      }
      if (row === null) {
        const fresh = {
          name: place.name,
          city: args.city,
          lat: place.lat,
          lng: place.lng,
          appleId: place.appleId,
          ...(place.category ? { category: place.category } : {}),
          ...(args.source ? { sources: [{ url: args.source }] } : {}),
          status: "live" as const,
          addedAt: Date.now(),
        };
        const _id = await ctx.db.insert("places", fresh);
        await indexPlace(ctx, { _id, ...fresh });
        added++;
        continue;
      }
      existing++;
      const inferredAlias =
        !row.appleId && row.status !== "live"
          ? {
              provider: "apple" as const,
              lat: place.lat,
              lng: place.lng,
              ...(place.category ? { category: place.category } : {}),
              ...(row.kind ? { catalogKind: row.kind } : {}),
              catalogStatus: row.status,
            }
          : undefined;
      const sources = row.sources ?? [];
      const source =
        args.source &&
        sources.length < MAX_SOURCES &&
        !sources.some((s) => s.url === args.source)
          ? [...sources, { url: args.source }]
          : undefined;
      if (row.status === "catalog") {
        await ctx.db.patch(row._id, {
          status: "live",
          appleId: place.appleId,
          ...(source ? { sources: source } : {}),
          ...(inferredAlias ? { inferredAlias } : {}),
        });
        await indexPlace(ctx, { ...row, status: "live" });
      } else if (source || !row.appleId) {
        await ctx.db.patch(row._id, {
          ...(source ? { sources: source } : {}),
          appleId: place.appleId,
          ...(inferredAlias ? { inferredAlias } : {}),
        });
      }
    }
    return { added, existing };
  },
});

export const curate = internalMutation({
  args: {
    id: v.id("places"),
    kind: v.optional(v.union(placeKindValidator, v.null())),
    cuisine: v.optional(v.union(cuisineValidator, v.null())),
    features: v.optional(v.array(placeFeatureValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { id, kind, cuisine, features }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Place not found");
    if (row.status === "catalog")
      throw new Error("Only Discover places can be curated");
    await ctx.db.patch(id, {
      ...(kind === undefined ? {} : { kind: kind ?? undefined }),
      ...(cuisine === undefined ? {} : { cuisine: cuisine ?? undefined }),
      ...(features === undefined
        ? {}
        : { features: features.length ? [...new Set(features)] : undefined }),
    });
    return null;
  },
});

export const addByName = internalAction({
  args: {
    city: v.string(),
    names: v.array(v.string()),
    source: v.optional(v.string()),
  },
  returns: reportValidator,
  handler: async (ctx, args) => {
    const names = [
      ...new Set(args.names.map((name) => name.trim()).filter(Boolean)),
    ];
    if (names.length > MAX_NAMES)
      throw new Error(`at most ${MAX_NAMES} names at a time`);
    const { name: city, token, centre } = await cityCentre(args.city);
    const found: StoredPlace[] = [];
    const missed: string[] = [];
    for (const name of names) {
      const at = await findVenue(token, name, `${name}, ${city}`, centre);
      if (!at?.appleId || !inCity(at, centre)) {
        missed.push(name);
        continue;
      }
      found.push({
        name,
        lat: at.lat,
        lng: at.lng,
        appleId: at.appleId,
        ...(at.category ? { category: at.category } : {}),
      });
    }
    const stored: { added: number; existing: number } = await ctx.runMutation(
      internal.places.store,
      {
        city,
        places: found,
        ...(args.source ? { source: args.source } : {}),
      },
    );
    logEvent("info", "places_imported", { ...stored, missed: missed.length });
    return { ...stored, missed };
  },
});

export const reindexPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    status: v.optional(v.union(v.literal("hidden"), v.literal("live"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = args.status ?? (args.cursor === null ? "hidden" : undefined);
    const table = ctx.db.query("places");
    const places = status
      ? table.withIndex("by_status", (q) => q.eq("status", status))
      : table;
    const { page, isDone, continueCursor } = await places.paginate({
      numItems: REINDEX_PAGE,
      cursor: args.cursor,
    });
    const rows = page.filter((row) => row.status !== "catalog");
    for (const row of rows) await indexPlace(ctx, row);
    const next = !isDone
      ? { cursor: continueCursor, status }
      : status === "hidden"
        ? { cursor: null, status: "live" as const }
        : null;
    logEvent("info", "places_reindexed", {
      count: rows.length,
      done: next === null,
    });
    if (next)
      await ctx.scheduler.runAfter(0, internal.places.reindexPage, next);
    return null;
  },
});
