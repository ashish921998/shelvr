// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser } from "./test.setup";

type Backend = ReturnType<typeof newConvexTest>;

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
      tags: [],
      searchText: "A place",
    }),
  );
}

async function kyotoPhoto(backend: Backend) {
  await backend.run((ctx) =>
    ctx.db.insert("cityPhotos", {
      key: "kyoto",
      city: "Kyoto",
      status: "found",
      url: "https://upload.wikimedia.org/kyoto.jpg",
      checkedAt: Date.now(),
    }),
  );
}

describe("setCityCover", () => {
  it("shows the latest pick even when an older pick was not cleared", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const tea = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/tea.jpg",
    );
    await backend.run(async (ctx) => {
      await ctx.db.patch(tea, { coverFor: [{ key: "kyoto", at: 1 }] });
      await ctx.db.patch(temple, { coverFor: [{ key: "kyoto", at: 2 }] });
    });
    const [kyoto] = await t.query(api.items.listCities, {});
    expect(kyoto).toMatchObject({
      cover: "https://cdn/temple.jpg",
      coverItemId: temple,
    });
  });

  it("goes back to the city photo when the latest pick stops, without bringing back an older one", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await kyotoPhoto(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const tea = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/tea.jpg",
    );
    await backend.run(async (ctx) => {
      await ctx.db.patch(tea, { coverFor: [{ key: "kyoto", at: 1 }] });
      await ctx.db.patch(temple, { coverFor: [{ key: "kyoto", at: 2 }] });
    });
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "Kyoto",
      on: false,
    });
    const [kyoto] = await t.query(api.items.listCities, {});
    expect(kyoto.cover).toBe("https://upload.wikimedia.org/kyoto.jpg");
    expect(kyoto).not.toHaveProperty("coverItemId");
  });

  it("leaves a newer pick in place when an older save is turned off", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await kyotoPhoto(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const tea = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/tea.jpg",
    );
    await backend.run(async (ctx) => {
      await ctx.db.patch(temple, { coverFor: [{ key: "kyoto", at: 1 }] });
      await ctx.db.patch(tea, { coverFor: [{ key: "kyoto", at: 2 }] });
    });
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "Kyoto",
      on: false,
    });
    const [kyoto] = await t.query(api.items.listCities, {});
    expect(kyoto).toMatchObject({
      cover: "https://cdn/tea.jpg",
      coverItemId: tea,
    });
  });

  it("ignores a newer pick on a save that left the city when the shown cover stops", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await kyotoPhoto(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const tea = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/tea.jpg",
    );
    const moved = await readySave(
      backend,
      userId,
      ["Osaka"],
      "https://cdn/moved.jpg",
    );
    await backend.run(async (ctx) => {
      await ctx.db.patch(tea, { coverFor: [{ key: "kyoto", at: 1 }] });
      await ctx.db.patch(temple, { coverFor: [{ key: "kyoto", at: 2 }] });
      await ctx.db.patch(moved, { coverFor: [{ key: "kyoto", at: 3 }] });
    });
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "Kyoto",
      on: false,
    });
    const kyoto = (await t.query(api.items.listCities, {})).find(
      (entry) => entry.city === "Kyoto",
    );
    expect(kyoto?.cover).toBe("https://upload.wikimedia.org/kyoto.jpg");
    expect(kyoto).not.toHaveProperty("coverItemId");
  });

  it("puts the picked save's photo on the city card over the city photo", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await kyotoPhoto(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "kyoto",
      on: true,
    });
    const [kyoto] = await t.query(api.items.listCities, {});
    expect(kyoto).toMatchObject({
      cover: "https://cdn/temple.jpg",
      coverItemId: temple,
    });
  });

  it("keeps one pick per city and goes back to the city photo when cleared", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    await kyotoPhoto(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const tea = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/tea.jpg",
    );
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "Kyoto",
      on: true,
    });
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: tea,
      city: "Kyoto",
      on: true,
    });
    const rows = await backend.run((ctx) => ctx.db.query("items").collect());
    expect(rows.map((row) => row.coverFor?.map((pick) => pick.key))).toEqual([
      undefined,
      ["kyoto"],
    ]);
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: tea,
      city: "Kyoto",
      on: false,
    });
    const [kyoto] = await t.query(api.items.listCities, {});
    expect(kyoto.cover).toBe("https://upload.wikimedia.org/kyoto.jpg");
    expect(kyoto).not.toHaveProperty("coverItemId");
  });

  it("refuses another account's save, a city the save is not in, and a save with no photo", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    const { t: stranger } = await signedInUser(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    const note = await readySave(backend, userId, ["Kyoto"]);
    await expect(
      stranger.mutation(api.cityCovers.setCityCover, {
        itemId: temple,
        city: "Kyoto",
        on: true,
      }),
    ).rejects.toThrow("Save not found");
    await expect(
      t.mutation(api.cityCovers.setCityCover, {
        itemId: temple,
        city: "Osaka",
        on: true,
      }),
    ).rejects.toThrow("Save is not in that city");
    await expect(
      t.mutation(api.cityCovers.setCityCover, {
        itemId: note,
        city: "Kyoto",
        on: true,
      }),
    ).rejects.toThrow("Save has no photo");
  });

  it("never returns the pick field on a save", async () => {
    const backend = newConvexTest();
    const { userId, t } = await signedInUser(backend);
    const temple = await readySave(
      backend,
      userId,
      ["Kyoto"],
      "https://cdn/temple.jpg",
    );
    await t.mutation(api.cityCovers.setCityCover, {
      itemId: temple,
      city: "Kyoto",
      on: true,
    });
    const items = await t.query(api.items.listCityItems, { city: "Kyoto" });
    expect(items[0]).not.toHaveProperty("coverFor");
  });
});
