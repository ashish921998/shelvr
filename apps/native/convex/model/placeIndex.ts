import { GeospatialIndex, type Rectangle } from "@convex-dev/geospatial";
import { v, type Infer } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
const MAX_DISCOVER_PLACES = 300;
const MAX_SCANNED = 2000;
const WIDE_DEGREES = 90;
const MAX_INDEX_CALLS = 2;
const MAX_LATITUDE = 90;

export const boxValidator = v.object({
  west: v.number(),
  south: v.number(),
  east: v.number(),
  north: v.number(),
});

export type MapBox = Infer<typeof boxValidator>;

const index = new GeospatialIndex<Id<"places">>(components.geospatial, {
  minLevel: 2,
  logLevel: "ERROR",
});

type Indexable = Pick<
  Doc<"places">,
  "_id" | "lat" | "lng" | "status" | "addedAt"
>;

export async function indexPlace(ctx: MutationCtx, row: Indexable) {
  if (row.status === "live")
    await index.insert(
      ctx,
      row._id,
      { latitude: row.lat, longitude: row.lng },
      {},
      row.addedAt,
    );
  else await index.remove(ctx, row._id);
}

const clampLatitude = (degrees: number) =>
  Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, degrees));

const wrapLongitude = (degrees: number) =>
  ((((degrees + 180) % 360) + 360) % 360) - 180;

function boxRectangles(box: MapBox): Rectangle[] {
  const { west, south, east, north } = box;
  if (![west, south, east, north].every(Number.isFinite))
    throw new Error("box must hold finite degrees");
  if (south > north) throw new Error("box south is above its north");
  const rows = { south: clampLatitude(south), north: clampLatitude(north) };
  const reach = east - west;
  const span = reach >= 360 ? 360 : ((reach % 360) + 360) % 360;
  const from = span === 360 ? -180 : wrapLongitude(west);
  const to = from + span;
  if (to <= 180) return [{ ...rows, west: from, east: to }];
  return [
    { ...rows, west: from, east: 180 },
    { ...rows, west: -180, east: to - 360 },
  ];
}

type DiscoverAnswer = { rows: Doc<"places">[]; complete: boolean };

const inside = (rectangles: Rectangle[], place: Doc<"places">) =>
  rectangles.some(
    (r) =>
      place.lat >= r.south &&
      place.lat <= r.north &&
      place.lng >= r.west &&
      place.lng <= r.east,
  );

async function scanLive(
  ctx: QueryCtx,
  rectangles: Rectangle[],
): Promise<DiscoverAnswer> {
  const found: Doc<"places">[] = [];
  let scanned = 0;
  for await (const place of ctx.db
    .query("places")
    .withIndex("by_status", (q) => q.eq("status", "live"))) {
    if (inside(rectangles, place)) found.push(place);
    scanned++;
    if (found.length >= MAX_DISCOVER_PLACES || scanned >= MAX_SCANNED)
      return { rows: found, complete: false };
  }
  return { rows: found, complete: true };
}

async function searchIndex(
  ctx: QueryCtx,
  rectangles: Rectangle[],
): Promise<DiscoverAnswer> {
  const slices = rectangles.map((rectangle) => ({
    rectangle,
    cursor: undefined as string | undefined,
    done: false,
  }));
  const found = new Set<Id<"places">>();
  let calls = 0;
  while (calls < MAX_INDEX_CALLS && found.size < MAX_DISCOVER_PLACES) {
    const open = slices.filter((slice) => !slice.done);
    if (open.length === 0) break;
    for (const [i, slice] of open.entries()) {
      if (calls === MAX_INDEX_CALLS || found.size >= MAX_DISCOVER_PLACES) break;
      calls++;
      const page = await index.query(
        ctx,
        {
          shape: { type: "rectangle", rectangle: slice.rectangle },
          limit: Math.ceil(
            (MAX_DISCOVER_PLACES - found.size) / (open.length - i),
          ),
        },
        slice.cursor,
      );
      for (const hit of page.results) found.add(hit.key);
      slice.cursor = page.nextCursor;
      slice.done = page.nextCursor === undefined;
    }
  }
  const rows = await Promise.all([...found].map((id) => ctx.db.get(id)));
  return {
    rows: rows.flatMap((row) =>
      row?.status === "live" && inside(rectangles, row) ? [row] : [],
    ),
    complete: slices.every((slice) => slice.done),
  };
}

export async function discoverPlaces(
  ctx: QueryCtx,
  box: MapBox,
): Promise<DiscoverAnswer> {
  const rectangles = boxRectangles(box);
  const width = rectangles.reduce((sum, r) => sum + r.east - r.west, 0);
  return width >= WIDE_DEGREES
    ? await scanLive(ctx, rectangles)
    : await searchIndex(ctx, rectangles);
}
