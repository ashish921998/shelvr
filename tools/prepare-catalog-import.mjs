import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_BATCH = 100;
const LICENSES = new Set(["CC0-1.0", "CDLA-Permissive-2.0", "Apache-2.0"]);
const DESSERTS = new Set([
  "bakery",
  "dessert_shop",
  "donut_shop",
  "ice_cream_shop",
]);

function kindFor(taxonomy) {
  if (!Array.isArray(taxonomy?.hierarchy)) return null;
  const [root, group] = taxonomy.hierarchy;
  switch (root) {
    case "food_and_drink":
      if (DESSERTS.has(taxonomy.primary)) return "dessert";
      if (group === "alcoholic_beverage_venue") return "drinks";
      if (group === "non_alcoholic_beverage_venue") return "coffee";
      if (group === "restaurant" || group === "casual_eatery") return "food";
      return null;
    case "arts_and_entertainment":
    case "cultural_and_historic":
    case "sports_and_recreation":
      return "activities";
    case "shopping":
      return "shopping";
    case "lodging":
      return "stay";
    default:
      return null;
  }
}

const localityKey = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : null;

function publicVenue(feature, city) {
  if (feature?.type !== "Feature") return null;
  const { id, geometry, properties } = feature;
  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates))
    return null;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 128 ||
    id !== id.trim()
  )
    return null;
  if (
    properties?.operating_status !== "open" ||
    !Number.isFinite(properties.confidence) ||
    properties.confidence < 0.8 ||
    properties.confidence > 1
  )
    return null;
  const { addresses, sources } = properties;
  if (
    !Array.isArray(addresses) ||
    !addresses.some(
      (address) => localityKey(address?.locality) === localityKey(city),
    )
  )
    return null;
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    !sources.every((source) => LICENSES.has(source?.license))
  )
    return null;

  if (typeof properties.names?.primary !== "string") return null;
  const name = properties.names.primary.trim();
  const kind = kindFor(properties.taxonomy);
  const [lng, lat] = geometry.coordinates;
  if (!kind || !name || name.length > 200) return null;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return { overtureId: id, name, city, lat, lng, kind };
}

export function catalogImportBatches(collection, city) {
  const locality = city.trim();
  if (!locality || locality.length > 120)
    throw new Error("Pass a valid city name.");
  if (
    collection?.type !== "FeatureCollection" ||
    !Array.isArray(collection.features)
  )
    throw new Error("Pass an Overture places GeoJSON FeatureCollection.");

  const rows = new Map();
  for (const feature of collection.features) {
    const row = publicVenue(feature, locality);
    if (row && !rows.has(row.overtureId)) rows.set(row.overtureId, row);
  }
  const places = [...rows.values()];
  const batches = [];
  for (let offset = 0; offset < places.length; offset += MAX_BATCH)
    batches.push({ places: places.slice(offset, offset + MAX_BATCH) });
  return batches;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [file, city] = process.argv.slice(2);
  if (!file || !city) {
    process.stderr.write(
      "Usage: node tools/prepare-catalog-import.mjs <places.geojson> <city>\n",
    );
    process.exitCode = 1;
  } else {
    const batches = catalogImportBatches(
      JSON.parse(readFileSync(file, "utf8")),
      city,
    );
    for (const batch of batches)
      process.stdout.write(`${JSON.stringify(batch)}\n`);
  }
}
