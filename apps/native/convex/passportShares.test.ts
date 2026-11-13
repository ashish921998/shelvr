// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { placeKey } from "./model/plan";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

const LISBON_CAFE = { lat: 38.71234, lng: -9.13987, appleId: "I1234ABCD" };
const LISBON_BAR = { lat: 38.72111, lng: -9.14555 };
const PORTO_BRANCH = { lat: 41.14961, lng: -8.61099 };
const PORTO_FAR_BRANCH = { lat: 41.16, lng: -8.63 };

type Spot = { lat: number; lng: number; appleId?: string };

async function person(backend: TestBackend, name: string, pro = true) {
  const { t, userId } = await signedInUser(backend, { pro });
  await backend.run((ctx) => ctx.db.patch(userId, { name }));
  return { t, userId };
}

async function stamp(
  backend: TestBackend,
  userId: Id<"users">,
  place: { name: string; city?: string; spot?: Spot; countryCode?: string },
) {
  await backend.run(async (ctx) => {
    const itemId = await ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: `Secret reel about ${place.name}`,
      url: "https://www.instagram.com/reel/SECRETPOST/",
      heroImageUrl: "https://cdn.example.com/secret-cover.jpg",
      note: "my home is around the corner",
      tags: [],
      ...(place.city ? { cities: [place.city] } : {}),
      places: [place.name],
      searchText: place.name,
    });
    await ctx.db.insert("placeVisits", {
      userId,
      key: placeKey(place.name),
      name: place.name,
      itemId,
      visitedAt: 1_700_000_000_123,
      backfilled: true,
      ...(place.spot
        ? {
            spots: [place.spot],
            stampPlaces: [
              {
                lat: place.spot.lat,
                lng: place.spot.lng,
                ...(place.city ? { city: place.city } : {}),
                ...(place.countryCode
                  ? { countryCode: place.countryCode }
                  : {}),
              },
            ],
          }
        : {}),
    });
  });
}

async function sharedMaya(backend: TestBackend) {
  const maya = await person(backend, "Maya Shah");
  await stamp(backend, maya.userId, {
    name: "Café Secreto",
    city: "Lisbon",
    spot: LISBON_CAFE,
    countryCode: "PT",
  });
  await stamp(backend, maya.userId, {
    name: "Bar Alto",
    city: "Lisbon",
    spot: LISBON_BAR,
    countryCode: "PT",
  });
  await stamp(backend, maya.userId, {
    name: "Majestic",
    city: "Porto",
    spot: PORTO_BRANCH,
    countryCode: "PT",
  });
  const token = await maya.t.mutation(api.passportShares.sharePassport, {});
  return { ...maya, token };
}

function leaks(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [
    "Shah",
    "SECRETPOST",
    "secret-cover",
    "Secret reel",
    "home is around",
    "I1234ABCD",
    "1700000000123",
    String(LISBON_CAFE.lat),
    String(LISBON_CAFE.lng),
    String(LISBON_BAR.lat),
    String(PORTO_BRANCH.lng),
    "itemId",
    "visitedAt",
    "backfilled",
    "countryCode",
    "userId",
  ].filter((secret) => text.includes(secret));
}

describe("sharePassport", () => {
  it("makes one random token that holds no user id, and reuses it", async () => {
    const backend = newConvexTest();
    const { t, userId } = await person(backend, "Maya");
    const token = await t.mutation(api.passportShares.sharePassport, {});
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toContain(String(userId));
    expect(await t.mutation(api.passportShares.sharePassport, {})).toBe(token);
    expect(await t.query(api.passportShares.myPassportShare, {})).toBe(token);
  });

  it("stops every link at once, and a new share gets a new token", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    await maya.t.mutation(api.passportShares.stopSharingPassport, {});
    expect(
      await backend.query(api.passportShares.passportPreview, {
        token: maya.token,
      }),
    ).toBeNull();
    expect(
      await maya.t.query(api.passportShares.myPassportShare, {}),
    ).toBeNull();
    const next = await maya.t.mutation(api.passportShares.sharePassport, {});
    expect(next).not.toBe(maya.token);
  });
});

describe("the public passport", () => {
  it("shows first name, counts, place names, cities and city-level dots only", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const preview = await backend.query(api.passportShares.passportPreview, {
      token: maya.token,
    });
    expect(preview).toEqual({
      ownerName: "Maya",
      places: 3,
      cities: 2,
      countries: 1,
      byCity: expect.arrayContaining([
        {
          city: "Lisbon",
          dot: { lat: 38.7, lng: -9.1 },
          names: expect.arrayContaining(["Café Secreto", "Bar Alto"]),
        },
        { city: "Porto", dot: { lat: 41.1, lng: -8.6 }, names: ["Majestic"] },
      ]),
    });
    expect(leaks(preview)).toEqual([]);
  });

  it("answers the web route the same, with the owner id kept server-side", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const shared = await backend.query(
      internal.passportShares.getPublicPassport,
      { token: maya.token },
    );
    expect(shared?.ownerId).toBe(maya.userId);
    expect(leaks(shared?.passport)).toEqual([]);
    const response = await backend.fetch(`/passport/shares/${maya.token}`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual(shared?.passport);
    expect(leaks(body)).toEqual([]);
  });

  it("answers null for an unknown token, an empty one, or an owner who is deleting", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    for (const token of ["", "0".repeat(32)]) {
      expect(
        await backend.query(api.passportShares.passportPreview, { token }),
      ).toBeNull();
    }
    expect(
      (await backend.fetch(`/passport/shares/${"0".repeat(32)}`)).status,
    ).toBe(404);
    await backend.run((ctx) => ctx.db.patch(maya.userId, { deleting: true }));
    expect(
      await backend.query(api.passportShares.passportPreview, {
        token: maya.token,
      }),
    ).toBeNull();
  });
});

describe("comparePassport", () => {
  it("splits places into both, only them and only you, by key, city and branch", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    await stamp(backend, sam.userId, {
      name: "cafe secreto",
      city: "lisbon",
      spot: { lat: 38.7124, lng: -9.1399 },
    });
    await stamp(backend, sam.userId, {
      name: "Majestic",
      city: "Porto",
      spot: PORTO_FAR_BRANCH,
    });
    await stamp(backend, sam.userId, {
      name: "Bar Alto",
      city: "Madrid",
      spot: { lat: 40.4168, lng: -3.7038 },
    });

    const compare = await sam.t.query(api.passportShares.comparePassport, {
      token: maya.token,
    });
    const sorted = (list: { name: string; city?: string }[] | undefined) =>
      [...(list ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    expect(compare?.ownerName).toBe("Maya");
    expect(compare?.both).toEqual([{ name: "cafe secreto", city: "lisbon" }]);
    expect(sorted(compare?.onlyThem)).toEqual([
      { name: "Bar Alto", city: "Lisbon" },
      { name: "Majestic", city: "Porto" },
    ]);
    expect(sorted(compare?.onlyYou)).toEqual([
      { name: "Bar Alto", city: "Madrid" },
      { name: "Majestic", city: "Porto" },
    ]);
    expect(compare?.toSave).toBe(1);
    expect(leaks(compare)).toEqual([]);
  });

  it("stops offering places once they are saved, and keeps them in Only them", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    const compare = () =>
      sam.t.query(api.passportShares.comparePassport, { token: maya.token });

    expect((await compare())?.toSave).toBe(3);
    await sam.t.mutation(api.passportShares.saveFriendPlaces, {
      token: maya.token,
      note: "From Maya’s passport",
    });
    const after = await compare();
    expect(after?.toSave).toBe(0);
    expect(after?.onlyThem).toHaveLength(3);
  });

  it("matches a stamp named with its city, and keeps two branches of one name apart", async () => {
    const backend = newConvexTest();
    const maya = await person(backend, "Maya Shah");
    await stamp(backend, maya.userId, {
      name: "Le Comptoir, Paris",
      city: "Paris",
      spot: { lat: 48.85, lng: 2.34 },
    });
    await stamp(backend, maya.userId, {
      name: "Majestic",
      city: "Porto",
      spot: PORTO_BRANCH,
    });
    await stamp(backend, maya.userId, {
      name: "Majestic",
      city: "Porto",
      spot: PORTO_FAR_BRANCH,
    });
    const token = await maya.t.mutation(api.passportShares.sharePassport, {});
    const sam = await person(backend, "Sam");
    await stamp(backend, sam.userId, {
      name: "Le Comptoir",
      city: "Paris",
      spot: { lat: 48.8501, lng: 2.3401 },
    });

    const compare = await sam.t.query(api.passportShares.comparePassport, {
      token,
    });
    expect(compare?.both).toEqual([{ name: "Le Comptoir", city: "Paris" }]);
    expect(compare?.onlyThem).toEqual([
      { name: "Majestic", city: "Porto" },
      { name: "Majestic", city: "Porto" },
    ]);
  });

  it("answers null once sharing stops", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    await maya.t.mutation(api.passportShares.stopSharingPassport, {});
    expect(
      await sam.t.query(api.passportShares.comparePassport, {
        token: maya.token,
      }),
    ).toBeNull();
  });
});

describe("saveFriendPlaces", () => {
  async function savesOf(backend: TestBackend, userId: Id<"users">) {
    return await backend.run((ctx) =>
      ctx.db
        .query("items")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
  }

  it("saves each only-them place with its name, city and the note, and copies nothing else", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    await stamp(backend, sam.userId, {
      name: "Café Secreto",
      city: "Lisbon",
      spot: LISBON_CAFE,
    });
    await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId: sam.userId,
        type: "link",
        status: "ready",
        tags: [],
        cities: ["Porto"],
        places: ["majestic"],
        searchText: "",
      }),
    );
    const before = (await savesOf(backend, sam.userId)).length;

    const result = await sam.t.mutation(api.passportShares.saveFriendPlaces, {
      token: maya.token,
      note: "From Maya’s passport",
    });

    expect(result).toEqual({ saved: 1, remaining: 0 });
    const saves = await savesOf(backend, sam.userId);
    expect(saves).toHaveLength(before + 1);
    const added = saves.at(-1);
    expect(added).toMatchObject({
      type: "note",
      status: "ready",
      title: "Bar Alto",
      note: "From Maya’s passport",
      cities: ["Lisbon"],
      places: ["Bar Alto"],
      placesEdited: true,
      titleSource: "user",
    });
    expect(added?.url).toBeUndefined();
    expect(added?.heroImageUrl).toBeUndefined();
    expect(added?.placePins).toBeUndefined();
    const { userId: _saver, ...copied } = added ?? { userId: "" };
    expect(leaks(copied)).toEqual([]);

    expect(
      await sam.t.mutation(api.passportShares.saveFriendPlaces, {
        token: maya.token,
        note: "From Maya’s passport",
      }),
    ).toEqual({ saved: 0, remaining: 0 });
  });

  it("saves a place stamped with its city in the name only once", async () => {
    const backend = newConvexTest();
    const maya = await person(backend, "Maya Shah");
    await stamp(backend, maya.userId, {
      name: "Le Comptoir, Paris",
      city: "Paris",
      spot: { lat: 48.85, lng: 2.34 },
    });
    const token = await maya.t.mutation(api.passportShares.sharePassport, {});
    const sam = await person(backend, "Sam");
    const run = () =>
      sam.t.mutation(api.passportShares.saveFriendPlaces, {
        token,
        note: "From Maya’s passport",
      });

    expect(await run()).toEqual({ saved: 1, remaining: 0 });
    expect(await run()).toEqual({ saved: 0, remaining: 0 });
    const saves = await savesOf(backend, sam.userId);
    expect(saves.map((save) => save.places)).toEqual([["Le Comptoir"]]);
  });

  it("counts a pinned place as saved only in its pin's city", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    await backend.run((ctx) =>
      ctx.db.insert("items", {
        userId: sam.userId,
        type: "link",
        status: "ready",
        tags: [],
        cities: ["Lisbon", "Porto"],
        places: ["Majestic"],
        placePins: [{ name: "Majestic", city: "Lisbon", ...LISBON_BAR }],
        searchText: "",
      }),
    );

    const result = await sam.t.mutation(api.passportShares.saveFriendPlaces, {
      token: maya.token,
      note: "From Maya’s passport",
    });

    expect(result).toEqual({ saved: 3, remaining: 0 });
  });

  it("saves fifty at a time and reports what is left", async () => {
    const backend = newConvexTest();
    const maya = await person(backend, "Maya Shah");
    for (let index = 0; index < 51; index += 1) {
      await stamp(backend, maya.userId, {
        name: `Spot ${index}`,
        city: "Lisbon",
        spot: LISBON_BAR,
      });
    }
    const token = await maya.t.mutation(api.passportShares.sharePassport, {});
    const sam = await person(backend, "Sam");
    const run = () =>
      sam.t.mutation(api.passportShares.saveFriendPlaces, {
        token,
        note: "From Maya’s passport",
      });

    expect(await run()).toEqual({ saved: 50, remaining: 1 });
    expect(await run()).toEqual({ saved: 1, remaining: 0 });
  });

  it("asks for Pro when free saves are off, and saves nothing", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam", false);
    await expect(
      sam.t.mutation(api.passportShares.saveFriendPlaces, {
        token: maya.token,
        note: "From Maya’s passport",
      }),
    ).rejects.toMatchObject({ data: { code: "pro_required" } });
    expect(await savesOf(backend, sam.userId)).toHaveLength(0);
  });

  it("answers null for a stopped link", async () => {
    const backend = newConvexTest();
    const maya = await sharedMaya(backend);
    const sam = await person(backend, "Sam");
    await maya.t.mutation(api.passportShares.stopSharingPassport, {});
    expect(
      await sam.t.mutation(api.passportShares.saveFriendPlaces, {
        token: maya.token,
        note: "x",
      }),
    ).toBeNull();
  });
});
