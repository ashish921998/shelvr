// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, setTestConsent, signedInUser } from "./test.setup";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

type Backend = ReturnType<typeof newConvexTest>;

const json = (body: unknown) => ({
  ok: true,
  status: 200,
  finalUrl: "",
  contentType: "application/json",
  bytes: new TextEncoder().encode(JSON.stringify(body)),
});
const image = {
  ok: true,
  status: 200,
  finalUrl: "",
  contentType: "image/jpeg",
  bytes: new Uint8Array(),
};
const notFound = { ok: false, code: "http_error", status: 404 };

beforeEach(() => {
  safeFetch.mockReset();
});

async function lookups(backend: Backend) {
  const jobs = await backend.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs
    .filter((job) => job.name.startsWith("cityPhotoLookup"))
    .map((job) => job.args[0] as { key: string; city: string });
}

async function photoRows(backend: Backend) {
  return await backend.run((ctx) => ctx.db.query("cityPhotos").collect());
}

async function readySave(
  backend: Backend,
  userId: Id<"users">,
  cities: string[],
  heroImageUrl?: string,
) {
  return await backend.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: "A place",
      cities,
      heroImageUrl,
      placePins: [{ name: "A place", lat: 35, lng: 135.7 }],
      tags: [],
      searchText: "A place",
    }),
  );
}

describe("a settled save asks for its cities' photos", () => {
  it("looks each new city up once, however often it is saved", async () => {
    const backend = newConvexTest();
    const { userId } = await signedInUser(backend);
    for (const city of ["Kyoto", "kyoto"]) {
      const itemId = await backend.run((ctx) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          status: "processing",
          title: "Reel",
          tags: [],
          searchText: "Reel",
        }),
      );
      await backend.mutation(internal.items.finalizeItem, {
        itemId,
        reading: {},
        classification: {
          title: "Temples",
          description: "Temples.",
          tags: [],
          cities: [city, "Osaka"],
        },
      });
    }
    expect(await lookups(backend)).toEqual([
      { key: "kyoto", city: "Kyoto" },
      { key: "osaka", city: "Osaka" },
    ]);
    expect((await photoRows(backend)).map((row) => row.status)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("asks for nothing for an account that declined AI", async () => {
    const backend = newConvexTest();
    const { userId } = await signedInUser(backend);
    await backend.run((ctx) => setTestConsent(ctx, userId, "declined"));
    const itemId = await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "processing",
        title: "Reel",
        tags: [],
        searchText: "Reel",
      }),
    );
    await backend.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Temples",
        description: "Temples.",
        tags: [],
        cities: ["Kyoto"],
      },
    });
    expect(await lookups(backend)).toEqual([]);
    expect(await photoRows(backend)).toEqual([]);
  });
});

describe("lookUp", () => {
  async function pending(backend: Backend, city: string) {
    await backend.run((ctx) =>
      ctx.db.insert("cityPhotos", {
        key: city.toLowerCase(),
        city,
        status: "pending",
        checkedAt: Date.now(),
      }),
    );
  }

  it("stores the city's Wikidata photo when Commons serves it", async () => {
    const backend = newConvexTest();
    await pending(backend, "Kyoto");
    safeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/page/summary/Kyoto")) {
        return json({
          type: "standard",
          description: "City in Japan",
          wikibase_item: "Q34600",
          coordinates: { lat: 1, lon: 1 },
        });
      }
      if (url.includes("wbgetclaims")) {
        return json({
          claims: {
            P18: [{ mainsnak: { datavalue: { value: "Kiyomizu dera.jpg" } } }],
          },
        });
      }
      if (url.startsWith("https://upload.wikimedia.org/")) return image;
      return notFound;
    });
    await backend.action(internal.cityPhotoLookup.lookUp, {
      key: "kyoto",
      city: "Kyoto",
    });
    const [row] = await photoRows(backend);
    expect(row).toMatchObject({ status: "found", file: "Kiyomizu_dera.jpg" });
    expect(row.url).toMatch(
      /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/Kiyomizu_dera\.jpg\/960px-Kiyomizu_dera\.jpg$/,
    );
  });

  it("falls back to the page's lead photo when the Wikidata one will not load", async () => {
    const backend = newConvexTest();
    await pending(backend, "Tbilisi");
    const lead =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Old_Tbilisi.jpg/320px-Old_Tbilisi.jpg?utm_source=en.wikipedia.org";
    safeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/page/summary/")) {
        return json({
          type: "standard",
          description: "Capital of Georgia",
          wikibase_item: "Q994",
          coordinates: { lat: 1, lon: 1 },
          thumbnail: { source: lead },
        });
      }
      if (url.includes("wbgetclaims")) {
        return json({
          claims: {
            P18: [{ mainsnak: { datavalue: { value: "Narikala.jpg" } } }],
          },
        });
      }
      if (url.endsWith("/960px-Old_Tbilisi.jpg")) return image;
      return notFound;
    });
    await backend.action(internal.cityPhotoLookup.lookUp, {
      key: "tbilisi",
      city: "Tbilisi",
    });
    const [row] = await photoRows(backend);
    expect(row).toMatchObject({
      status: "found",
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Old_Tbilisi.jpg/960px-Old_Tbilisi.jpg",
    });
    expect(row.file).toBeUndefined();
  });

  it("stores a miss for a name that is not one place", async () => {
    const backend = newConvexTest();
    await pending(backend, "Springfield");
    safeFetch.mockResolvedValue(json({ type: "disambiguation" }));
    await backend.action(internal.cityPhotoLookup.lookUp, {
      key: "springfield",
      city: "Springfield",
    });
    const [row] = await photoRows(backend);
    expect(row).toMatchObject({ status: "missing" });
    expect(row.url).toBeUndefined();
  });

  it("stores a failure, not a miss, when the photo host refuses for now", async () => {
    const backend = newConvexTest();
    await pending(backend, "Chicago");
    safeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/page/summary/")) {
        return json({
          type: "standard",
          description: "City in Illinois",
          wikibase_item: "Q1297",
          coordinates: { lat: 1, lon: 1 },
        });
      }
      if (url.includes("wbgetclaims")) {
        return json({
          claims: {
            P18: [
              { mainsnak: { datavalue: { value: "Chicago skyline.jpg" } } },
            ],
          },
        });
      }
      return { ok: false, code: "http_error", status: 429 };
    });
    await backend.action(internal.cityPhotoLookup.lookUp, {
      key: "chicago",
      city: "Chicago",
    });
    expect((await photoRows(backend))[0]).toMatchObject({ status: "failed" });
  });

  it("stores a failure to retry when Wikipedia is down", async () => {
    const backend = newConvexTest();
    await pending(backend, "Kyoto");
    safeFetch.mockResolvedValue({ ok: false, code: "timeout" });
    await backend.action(internal.cityPhotoLookup.lookUp, {
      key: "kyoto",
      city: "Kyoto",
    });
    expect((await photoRows(backend))[0]).toMatchObject({ status: "failed" });
  });
});

describe("listCities", () => {
  it("covers a city with its stored photo before any save's thumbnail", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await readySave(backend, userId, ["Kyoto"], "https://cdn/reel.jpg");
    await readySave(backend, userId, ["Osaka"], "https://cdn/osaka-reel.jpg");
    await backend.run((ctx) =>
      ctx.db.insert("cityPhotos", {
        key: "kyoto",
        city: "Kyoto",
        status: "found",
        url: "https://upload.wikimedia.org/kyoto.jpg",
        checkedAt: Date.now(),
      }),
    );
    const cities = await t.query(api.items.listCities, {});
    expect(
      Object.fromEntries(cities.map((entry) => [entry.city, entry.cover])),
    ).toEqual({
      Kyoto: "https://upload.wikimedia.org/kyoto.jpg",
      Osaka: "https://cdn/osaka-reel.jpg",
    });
  });
});

describe("backfillPage", () => {
  it("asks for every city an allowed account has saved, once each", async () => {
    const backend = newConvexTest();
    const { userId } = await signedInUser(backend);
    const { userId: declined } = await signedInUser(backend);
    await backend.run((ctx) => setTestConsent(ctx, declined, "declined"));
    await readySave(backend, userId, ["Kyoto", "Osaka"]);
    await readySave(backend, userId, ["kyoto"]);
    await readySave(backend, declined, ["Hanoi"]);
    await backend.mutation(internal.cityPhotos.backfillPage, { cursor: null });
    expect((await lookups(backend)).map((job) => job.key).sort()).toEqual([
      "kyoto",
      "osaka",
    ]);
  });
});

describe("the ten-city limit", () => {
  it("counts only cities that still need a photo", async () => {
    const backend = newConvexTest();
    const { userId } = await signedInUser(backend);
    const cities = Array.from({ length: 12 }, (_, i) => `City ${i}`);
    await backend.run(async (ctx) => {
      for (const city of cities.slice(0, 2)) {
        await ctx.db.insert("cityPhotos", {
          key: city.toLowerCase(),
          city,
          status: "found",
          url: "https://x/photo.jpg",
          checkedAt: Date.now(),
        });
      }
    });
    const itemId = await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        status: "processing",
        title: "Reel",
        tags: [],
        searchText: "Reel",
      }),
    );
    await backend.mutation(internal.items.finalizeItem, {
      itemId,
      reading: {},
      classification: {
        title: "Tour",
        description: "Tour.",
        tags: [],
        cities,
      },
    });
    expect((await lookups(backend)).map((job) => job.city)).toEqual(
      cities.slice(2),
    );
  });
});

describe("recoverStale", () => {
  it("looks up again a failed or stuck city a day later, and nothing else", async () => {
    const backend = newConvexTest();
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await backend.run(async (ctx) => {
      const rows = [
        { city: "Houston", status: "failed" as const, checkedAt: old },
        { city: "Austin", status: "pending" as const, checkedAt: old },
        { city: "Chicago", status: "failed" as const, checkedAt: Date.now() },
        { city: "Hana", status: "missing" as const, checkedAt: old },
        { city: "Maui", status: "found" as const, checkedAt: old },
      ];
      for (const row of rows) {
        await ctx.db.insert("cityPhotos", {
          key: row.city.toLowerCase(),
          ...row,
        });
      }
    });
    await backend.mutation(internal.cityPhotos.recoverStale, {});
    expect((await lookups(backend)).map((job) => job.key).sort()).toEqual([
      "austin",
      "houston",
    ]);
  });
});
