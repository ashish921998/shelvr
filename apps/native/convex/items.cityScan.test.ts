// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CITY_SCAN_ROWS } from "./items";
import { EMBEDDING_DIMENSIONS } from "./model/embedding";
import { newConvexTest, signedInUser } from "./test.setup";

const CITIES = ["Austin", "Chicago", "Lisbon", "Tokyo", "Paris"];
// About 1.5 KB, the size of a long reel caption.
const CAPTION =
  "Best tacos in town, go early, order the al pastor and the horchata. ".repeat(
    22,
  );
// Full-precision components like a real normalized vector's, so the JSON size the
// read budget counts matches production.
const VECTOR = Array.from(
  { length: EMBEDDING_DIMENSIONS },
  (_, index) => Math.sin(index + 1) / 30,
);

type Backend = Awaited<ReturnType<typeof signedInUser>>;

/** `count` ready reel saves, oldest first; every third names three mapped places. */
async function seedShelf(
  { t, userId }: Backend,
  count: number,
  embedded: boolean,
) {
  let pins = 0;
  for (let start = 0; start < count; start += 50) {
    await t.run(async (ctx) => {
      for (let i = start; i < Math.min(count, start + 50); i++) {
        const city = CITIES[i % CITIES.length];
        const placePins =
          i % 3 === 0
            ? [0, 1, 2].map((k) => ({
                name: `Spot ${i}-${k}`,
                lat: 30 + i * 0.001 + k * 0.0001,
                lng: -97 - i * 0.001 - k * 0.0001,
                city,
                category: "Restaurant",
              }))
            : undefined;
        pins += placePins?.length ?? 0;
        await ctx.db.insert("items", {
          userId: userId as Id<"users">,
          type: "link",
          status: "ready",
          title: `Reel ${i}`,
          url: `https://www.instagram.com/reel/${i}`,
          description: "A short description of the reel.",
          tags: ["food", "tacos"],
          cities: [city],
          places: placePins?.map((pin) => pin.name),
          placePins,
          content: CAPTION,
          searchText: `reel ${i} ${city}`,
          ...(embedded ? { embedding: VECTOR, embeddingVersion: 1 } : {}),
        });
      }
    });
  }
  return pins;
}

async function savesCounted(t: Backend["t"]) {
  const cities = await t.query(api.items.listCities, {});
  return cities.reduce((sum, city) => sum + city.count, 0);
}

describe("Home and Map at 1,000 saves", () => {
  it(
    "show every city and place once the embeddings are cleared",
    { timeout: 120_000 },
    async () => {
      vi.useFakeTimers();
      try {
        const backend = await signedInUser(newConvexTest(), { pro: true });
        const { t } = backend;
        const pins = await seedShelf(backend, CITY_SCAN_ROWS, true);

        // With a vector on every save, the 4 MB read budget runs out long before 1,000.
        expect(await savesCounted(t)).toBeLessThan(300);

        await t.mutation(internal.items.clearEmbeddings, { cursor: null });
        await t.finishAllScheduledFunctions(vi.runAllTimers);

        const cities = await t.query(api.items.listCities, {});
        expect(cities.map(({ city, count }) => [city, count]).sort()).toEqual(
          CITIES.map((city) => [city, 200]).sort(),
        );
        expect(await t.query(api.mapPlaces.listMapPlaces, {})).toHaveLength(
          pins,
        );
        for (const city of CITIES) {
          expect(await t.query(api.items.listCityItems, { city })).toHaveLength(
            200,
          );
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it(
    "show the newest 1,000 when there are more",
    { timeout: 120_000 },
    async () => {
      const backend = await signedInUser(newConvexTest(), { pro: true });
      const { t, userId } = backend;
      await seedShelf(backend, CITY_SCAN_ROWS, false);
      await t.run((ctx) =>
        ctx.db.insert("items", {
          userId: userId as Id<"users">,
          type: "link",
          status: "ready",
          title: "Newest reel",
          tags: [],
          cities: ["Oslo"],
          searchText: "newest reel oslo",
        }),
      );

      const cities = await t.query(api.items.listCities, {});
      expect(await savesCounted(t)).toBe(CITY_SCAN_ROWS);
      expect(cities.find((city) => city.city === "Oslo")?.count).toBe(1);
      // The oldest save (an Austin reel) is the one left out.
      expect(cities.find((city) => city.city === "Austin")?.count).toBe(199);
    },
  );
});
