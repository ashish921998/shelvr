// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { newConvexTest, insertConsentingUser } from "./test.setup";
import { PLACE_LIST_CITIES_SYSTEM } from "./model/placeList";

const safeFetch = vi.hoisted(() => vi.fn());
const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject,
}));

vi.mock("./model/safeFetch", async (original) => ({
  ...(await original<typeof import("./model/safeFetch")>()),
  safeFetch,
}));

const LIST_ID = "PiSwyqmbpwpP_Nr5sAang4x5QxbKwA";
const SHORT = "https://maps.app.goo.gl/MMjvFNWpUTjiupHc9";
const LANDED = `https://www.google.com/maps/@35.68,136.48,8z/data=!4m2!11m1!2s${LIST_ID}`;
const ENDPOINT = `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m4!1s${LIST_ID}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;

const PLACES: [string, string, string, string][] = [
  ["Marcy Land", "Uni ramen", "Minato City, Tokyo", "Tokyo"],
  ["Savoy Azabujuban", "Bluefin tuna pizza", "Azabujuban, Tokyo", "Tokyo"],
  ["Mori Mori Tei", "Best Hamburg ever", "115 Oiwake, Karuizawa", "Karuizawa"],
  ["Noyanopan", "", "Toranomon, Tokyo", "Tokyo"],
];

function listBody() {
  const entries = PLACES.map(([name, note, address], i) => [
    null,
    [null, null, name, null, address, [null, null, (3560 + i) / 100, 139.7]],
    name,
    note,
  ]);
  return (
    ")]}'\n" +
    JSON.stringify([
      [[LIST_ID], 4, [], ["Sam Lee"], "Tokyo", "", null, null, entries],
    ])
  );
}

function respond(url: string, contentType: string, body: string) {
  return {
    ok: true,
    finalUrl: url,
    status: 200,
    contentType,
    bytes: new TextEncoder().encode(body),
  };
}

function serveList() {
  safeFetch.mockImplementation(async (url: string) => {
    if (url === SHORT) return respond(LANDED, "text/html", "<html></html>");
    if (url === ENDPOINT) return respond(url, "application/json", listBody());
    return { ok: false, code: "http_error", status: 599 };
  });
}

function model(cityCall: () => Promise<unknown>) {
  generateObject.mockImplementation(async (call: { system?: string }) =>
    call.system === PLACE_LIST_CITIES_SYSTEM
      ? await cityCall()
      : {
          object: {
            title: "Tokyo food",
            description: "Places to eat in Tokyo.",
            tags: ["restaurants"],
            spaceNames: [],
            intents: [
              { kind: "open_maps", label: "Map", value: "Mori Mori Tei" },
              { kind: "open_maps", label: "Map", value: "Marcy Land" },
            ],
            cities: ["Tokyo"],
            places: ["Marcy Land"],
            // A list line carries each place's address, so the model reads branch clues off it.
            placeLocations: [
              { name: "Marcy Land", location: "Minato City, Tokyo" },
              { name: "Savoy Azabujuban", location: "Azabujuban, Tokyo" },
            ],
          },
        },
  );
}

const NAMED = async () => ({
  object: {
    cities: PLACES.map(([, , , city], i) => ({ index: i + 1, city })),
  },
});

async function saveList(t: ReturnType<typeof newConvexTest>) {
  const userId = await t.run(async (ctx) => {
    const userId = await insertConsentingUser(ctx);
    await ctx.db.insert("subscriptions", {
      userId,
      status: "pro",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
    return userId;
  });
  const itemId = await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      url: SHORT,
      status: "processing",
      processingRunId: "run-1",
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
    }),
  );
  return { userId, itemId };
}

async function savesOf(t: ReturnType<typeof newConvexTest>, userId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("items")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

async function located(
  t: ReturnType<typeof newConvexTest>,
  job = "locateItem",
) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return jobs
    .filter((scheduled) => scheduled.name.includes(job))
    .map((job) => (job.args[0] as { itemId: Id<"items"> }).itemId);
}

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  safeFetch.mockReset();
  generateObject.mockReset();
  serveList();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("processItem on a shared Google Maps list", () => {
  it("makes one save per city with the list's own places", async () => {
    model(NAMED);
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const saves = await savesOf(t, userId);
    expect(
      saves.map(({ title, cities, places, status, content }) => ({
        title,
        cities,
        places,
        status,
        content,
      })),
    ).toEqual([
      {
        title: "Tokyo",
        cities: ["Tokyo"],
        places: ["Marcy Land", "Savoy Azabujuban", "Noyanopan"],
        status: "ready",
        content:
          "Marcy Land — Uni ramen\nSavoy Azabujuban — Bluefin tuna pizza\nNoyanopan",
      },
      {
        title: "Karuizawa · Tokyo",
        cities: ["Karuizawa"],
        places: ["Mori Mori Tei"],
        status: "ready",
        content: "Mori Mori Tei — Best Hamburg ever",
      },
    ]);
    expect(saves[1]).toMatchObject({
      url: SHORT,
      siteName: "Google Maps",
      author: "Sam Lee",
      description: "Places to eat in Tokyo.",
    });
    expect(saves[1].searchText).toContain("mori mori tei");
    expect(saves[0].intents?.map((intent) => intent.value)).toEqual([
      "Marcy Land",
    ]);
    expect(new Set(await located(t))).toEqual(
      new Set(saves.map((save) => save._id)),
    );
    expect(new Set(await located(t, "identifyPins"))).toEqual(
      new Set(saves.map((save) => save._id)),
    );
    expect(saves.map((save) => save.placePins)).toEqual([
      [
        { name: "Marcy Land", lat: 35.6, lng: 139.7, city: "Tokyo" },
        { name: "Savoy Azabujuban", lat: 35.61, lng: 139.7, city: "Tokyo" },
        { name: "Noyanopan", lat: 35.63, lng: 139.7, city: "Tokyo" },
      ],
      [{ name: "Mori Mori Tei", lat: 35.62, lng: 139.7, city: "Karuizawa" }],
    ]);
  });

  it("leaves a list place pinned at the list's point when Apple's lookup runs", async () => {
    model(NAMED);
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    const before = (await savesOf(t, userId)).map((save) => save.placePins);
    for (const id of await located(t)) {
      await t.action(internal.placePins.locateItem, { itemId: id });
    }
    expect((await savesOf(t, userId)).map((save) => save.placePins)).toEqual(
      before,
    );
  });

  it("adds no second copy of a part when the list is read again", async () => {
    model(NAMED);
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    await t.run((ctx) =>
      ctx.db.patch(itemId, { status: "processing", processingRunId: "run-2" }),
    );
    await t.action(internal.ai.processItem, { itemId, runId: "run-2" });

    const titles = (await savesOf(t, userId)).map((save) => save.title);
    expect(titles).toEqual(["Tokyo", "Karuizawa · Tokyo"]);
  });

  it("keeps the model's reading when it cannot name the cities", async () => {
    model(async () => {
      throw new Error("model down");
    });
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const saves = await savesOf(t, userId);
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      status: "ready",
      title: "Tokyo food",
      places: ["Marcy Land"],
    });
  });
});

describe("addPlaceListParts", () => {
  const PART = {
    title: "Tokyo · Kyoto",
    cities: ["Kyoto"],
    places: ["Ippodo"],
    pins: [],
    content: "Ippodo",
  };

  it("adds nothing for a run that no longer owns the save", async () => {
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.run((ctx) => ctx.db.patch(itemId, { status: "ready" }));
    const added = await t.mutation(internal.items.addPlaceListParts, {
      itemId,
      runId: "run-old",
      parts: [PART],
    });
    expect(added).toBe(0);
    expect(await savesOf(t, userId)).toHaveLength(1);
  });

  it("adds nothing for an account being deleted", async () => {
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "ready" });
      await ctx.db.patch(userId, { deleting: true });
    });
    const added = await t.mutation(internal.items.addPlaceListParts, {
      itemId,
      runId: "run-1",
      parts: [PART],
    });
    expect(added).toBe(0);
  });

  it("adds no other parts once the owner's Pro has lapsed", async () => {
    const t = newConvexTest();
    const { userId, itemId } = await saveList(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(itemId, { status: "ready" });
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.patch(sub!._id, { expiresAt: Date.now() - 1000 });
    });
    const added = await t.mutation(internal.items.addPlaceListParts, {
      itemId,
      runId: "run-1",
      parts: [PART],
    });
    expect(added).toBe(0);
    expect(await savesOf(t, userId)).toHaveLength(1);
  });
});
