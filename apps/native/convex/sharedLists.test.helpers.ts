import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

export const LISBON = { lat: 38.7223, lng: -9.1393 };
export const near = (steps: number) => ({
  lat: LISBON.lat + steps * 0.001,
  lng: LISBON.lng,
});

type Pin = {
  name: string;
  lat: number;
  lng: number;
  appleId?: string;
  category?: string;
  city?: string;
};

export async function seedSave(
  base: TestBackend,
  userId: Id<"users">,
  options: {
    city?: string;
    cities?: string[];
    pins: Pin[];
    tags?: string[];
    title?: string;
  },
): Promise<Id<"items">> {
  const cities = options.cities ?? [options.city ?? "Lisbon"];
  return await base.run(async (ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      title: options.title ?? "A reel",
      cities,
      places: options.pins.map((pin) => pin.name),
      placePins: options.pins.map((pin) => ({
        ...pin,
        ...(pin.city === undefined && cities.length === 1
          ? { city: cities[0] }
          : {}),
      })),
      url: "https://www.tiktok.com/@someone/video/1",
      tags: options.tags ?? ["food"],
      searchText: options.title ?? "A reel",
    }),
  );
}

export async function listWithOwner(options: { pro?: boolean } = {}) {
  const base = newConvexTest();
  const owner = await signedInUser(base, {
    pro: options.pro ?? true,
    email: "ana@example.com",
  });
  await base.run((ctx) => ctx.db.patch(owner.userId, { name: "Ana Silva" }));
  const itemId = await seedSave(base, owner.userId, {
    pins: [
      { name: "Time Out Market", ...LISBON, category: "Restaurant" },
      {
        name: "Manteigaria",
        ...near(2),
        appleId: "A-mant",
        category: "Bakery",
      },
    ],
  });
  const { listId, inviteToken: token } = await owner.t.mutation(
    api.sharedLists.createSharedList,
    { name: "  Lisbon  weekend ", cities: ["Lisbon"] },
  );
  return { base, owner, itemId, listId, token };
}

export async function joiner(
  base: TestBackend,
  token: string,
  options: { pro?: boolean; name?: string } = {},
) {
  const person = await signedInUser(base, { pro: options.pro ?? false });
  await base.run((ctx) =>
    ctx.db.patch(person.userId, { name: options.name ?? "Bo Costa" }),
  );
  const joined = await person.t.mutation(api.sharedLists.joinSharedList, {
    token,
  });
  return { ...person, joined };
}
