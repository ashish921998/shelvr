import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { placeKey } from "./model/plan";
import { newConvexTest, signedInUser, type TestBackend } from "./test.setup";

export const CITY = "Mexico City";
export const TITLES = [
  "Tacos al pastor crawl",
  "Pan dulce worth the queue",
  "Coffee in Coyoacán",
  "Contramar tuna tostadas",
  "Frida museum notes",
  "Still reading this one",
  "Austin coffee stops",
];
export const NOTE_TEXT = "Frida museum: book tickets ahead.";
export const TAGS = ["cdmx-eats", "weekend-trip"];
export const PAGE_ORDER = [
  "Contramar",
  "Café Avellaneda",
  "Panadería Rosetta",
  "Taquería Orinoco",
];
export const PINS: Record<string, { lat: number; lng: number }> = {
  Contramar: { lat: 19.4192, lng: -99.1663 },
  "Café Avellaneda": { lat: 19.34813, lng: -99.16222 },
  "Panadería Rosetta": { lat: 19.4196, lng: -99.1606 },
  "Taquería Orinoco": { lat: 19.41807, lng: -99.16417 },
};
export const POSTS: Record<string, string> = {
  Contramar: "https://www.instagram.com/reel/DFixtureMx1/",
  "Panadería Rosetta": "https://youtu.be/fixtureMx01",
  "Taquería Orinoco":
    "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001",
};

type Save = Partial<Doc<"items">>;

function creatorSaves(): Save[] {
  return [
    {
      title: TITLES[0],
      url: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001?is_from_webapp=1&sender_device=pc",
      placePins: [
        { name: "Taquería Orinoco", ...PINS["Taquería Orinoco"] },
        { name: "Calle Durango 200", lat: 19.4205, lng: -99.168 },
      ],
    },
    {
      title: TITLES[1],
      url: "https://www.youtube.com/watch?v=fixtureMx01&si=shelvrfixture",
      placePins: [
        {
          name: "Panadería Rosetta",
          ...PINS["Panadería Rosetta"],
          category: "Bakery",
        },
      ],
    },
    {
      title: TITLES[2],
      url: "https://vm.tiktok.com/ZMfixture1/",
      placePins: [{ name: "Café Avellaneda", ...PINS["Café Avellaneda"] }],
    },
    {
      title: TITLES[3],
      url: "https://www.instagram.com/someone/reel/DFixtureMx1/?igsh=c2hlbHZyZml4dHVyZQ==",
      placePins: [
        {
          name: "Contramar",
          ...PINS.Contramar,
          city: CITY,
          appleId: "apple-contramar",
          category: "Restaurant",
        },
      ],
    },
    {
      type: "note",
      title: TITLES[4],
      note: NOTE_TEXT,
      placePins: [{ name: "Museo Frida Kahlo", lat: 19.3551, lng: -99.1624 }],
    },
    {
      status: "processing",
      title: TITLES[5],
      url: "https://example.com/el-moro",
      placePins: [{ name: "El Moro", lat: 19.4337, lng: -99.1411 }],
    },
    {
      title: TITLES[6],
      url: "https://example.com/places/austin-coffee",
      cities: ["Austin"],
      placePins: [{ name: "Jo's Coffee", lat: 30.2502, lng: -97.7496 }],
    },
  ];
}

export async function insertSave(
  backend: TestBackend,
  userId: Id<"users">,
  fields: Save,
): Promise<Id<"items">> {
  return await backend.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      status: "ready",
      tags: TAGS,
      searchText: "",
      cities: [CITY],
      ...fields,
    }),
  );
}

export async function creatorWithPage(
  options: { backend?: TestBackend; name?: string; cities?: string[] } = {},
) {
  const backend = options.backend ?? newConvexTest();
  const creator = await signedInUser(backend, { pro: true });
  const name = options.name ?? "Maya Lopez";
  if (name !== "") {
    await backend.run((ctx) => ctx.db.patch(creator.userId, { name }));
  }
  const itemIds: Id<"items">[] = [];
  for (const save of creatorSaves()) {
    itemIds.push(await insertSave(backend, creator.userId, save));
  }
  await backend.run((ctx) =>
    ctx.db.insert("placeVisits", {
      userId: creator.userId,
      key: placeKey("Contramar"),
      name: "Contramar",
      itemId: itemIds[3],
      visitedAt: Date.now(),
    }),
  );
  const { token } = await creator.t.mutation(
    api.publicMaps.setPublicMapCities,
    { cities: options.cities ?? [CITY, "Austin"] },
  );
  await creator.t.mutation(api.publicMaps.setPublicMapSaveAll, { on: true });
  const mapId = await backend.run(async (ctx) => {
    const page = await ctx.db
      .query("publicMaps")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return page!._id;
  });
  return { backend, creator, token, mapId, itemIds };
}

export async function follower(backend: TestBackend, name = "Bo Costa") {
  const person = await signedInUser(backend, { pro: false });
  await backend.run((ctx) => ctx.db.patch(person.userId, { name }));
  return person;
}

export function listsOwnedBy(backend: TestBackend, userId: Id<"users">) {
  return backend.run((ctx) =>
    ctx.db
      .query("sharedLists")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect(),
  );
}

export function listRows(backend: TestBackend, listId: Id<"sharedLists">) {
  return backend.run(async (ctx) => ({
    list: await ctx.db.get(listId),
    places: await ctx.db
      .query("sharedListPlaces")
      .withIndex("by_list_and_added", (q) => q.eq("listId", listId))
      .order("desc")
      .collect(),
    members: await ctx.db
      .query("sharedListMembers")
      .withIndex("by_list_and_user", (q) => q.eq("listId", listId))
      .collect(),
  }));
}
