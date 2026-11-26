import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogImportBatches } from "./prepare-catalog-import.mjs";

const feature = (id, overrides = {}) => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [-122.41, 37.78] },
  properties: {
    names: { primary: "Public café" },
    taxonomy: {
      primary: "coffee_shop",
      hierarchy: [
        "food_and_drink",
        "non_alcoholic_beverage_venue",
        "coffee_shop",
      ],
    },
    operating_status: "open",
    confidence: 0.95,
    addresses: [{ locality: "San Francisco", freeform: "unused address" }],
    sources: [{ license: "CDLA-Permissive-2.0", record_id: "unused source" }],
    phones: ["unused phone"],
    ...overrides,
  },
});
const collection = (features) => ({ type: "FeatureCollection", features });

test("catalog import keeps only indexed fields for eligible public venues", () => {
  const rows = [
    feature("open"),
    feature("open"),
    feature("closed", { operating_status: "permanently_closed" }),
    feature("wrong-city", { addresses: [{ locality: "Oakland" }] }),
    feature("unlicensed", { sources: [{ license: "unknown" }] }),
    feature("private-category", { taxonomy: { hierarchy: ["residential"] } }),
    feature("low-confidence", { confidence: 0.5 }),
    null,
  ];
  assert.deepEqual(catalogImportBatches(collection(rows), "San Francisco"), [
    {
      places: [
        {
          overtureId: "open",
          name: "Public café",
          city: "San Francisco",
          lat: 37.78,
          lng: -122.41,
          kind: "coffee",
        },
      ],
    },
  ]);
});

test("catalog import batches at most 100 venues per mutation", () => {
  const features = Array.from({ length: 107 }, (_, i) => feature(String(i)));
  const argumentsPerBatch = catalogImportBatches(
    collection(features),
    "San Francisco",
  );
  assert.deepEqual(
    argumentsPerBatch.map((batch) => batch.places.length),
    [100, 7],
  );
});
