import { GeospatialIndex, type Rectangle } from "@convex-dev/geospatial";
import { v, type Infer } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_DISCOVER_PLACES = 300;

const MAX_INDEX_CALLS = 8;
const MAX_SLICE_DEGREES = 90;
const MAX_LATITUDE = 90;

export const boxValidator = v.object({
  west: v.number(),
  south: v.number(),
  east: v.number(),
  north: v.number(),
});

export type MapBox = Infer<typeof boxValidator>;

const index = new GeospatialIndex<Id<"places">>(components.geospatial, {
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

export function boxRectangles(box: MapBox): Rectangle[] {
  const { west, south, east, north } = box;
  if (![west, south, east, north].every(Number.isFinite))
    throw new Error("box must hold finite degrees");
  if (south > north) throw new Error("box south is above its north");
  const rows = { south: clampLatitude(south), north: clampLatitude(north) };
  const reach = east - west;
  const span = reach >= 360 ? 360 : ((reach % 360) + 360) % 360;
  const rectangles: Rectangle[] = [];
  let from = span === 360 ? -180 : wrapLongitude(west);
  let left = span;
  do {
    const to = Math.min(from + left, 180, from + MAX_SLICE_DEGREES);
    rectangles.push({ ...rows, west: from, east: to });
    left -= to - from;
    from = to === 180 ? -180 : to;
  } while (left > 0);
  return rectangles;
}

export async function placesInBox(
  ctx: QueryCtx,
  box: MapBox,
): Promise<Id<"places">[]> {
  const found = new Set<Id<"places">>();
  let calls = 0;
  for (const rectangle of boxRectangles(box)) {
    let cursor: string | undefined;
    while (found.size < MAX_DISCOVER_PLACES && calls < MAX_INDEX_CALLS) {
      calls++;
      const page = await index.query(
        ctx,
        {
          shape: { type: "rectangle", rectangle },
          limit: MAX_DISCOVER_PLACES - found.size,
        },
        cursor,
      );
      for (const hit of page.results) found.add(hit.key);
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
    }
  }
  return [...found].slice(0, MAX_DISCOVER_PLACES);
}
