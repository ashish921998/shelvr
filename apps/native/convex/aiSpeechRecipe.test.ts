// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "@convex/_generated/api";
import {
  newConvexTest,
  insertConsentingUser,
  setTestConsent,
} from "./test.setup";

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

const TIKTOK = "https://www.tiktok.com/@cook/video/7350000000000000000";
const SPOKEN = {
  name: "Creamy pasta",
  ingredients: ["2 tbsp butter", "1/3 cup heavy cream"],
  steps: ["Melt the butter.", "Stir in the cream."],
};

const fetchMock = vi.fn();

function serveTikTok() {
  safeFetch.mockImplementation(async (url: string) =>
    url.startsWith("https://www.tiktok.com/oembed?")
      ? {
          ok: true,
          finalUrl: url,
          status: 200,
          contentType: "application/json",
          bytes: new TextEncoder().encode(
            JSON.stringify({
              title: "Best creamy pasta ever 🍝",
              author_unique_id: "cook",
              embed_product_id: "7350000000000000000",
            }),
          ),
        }
      : { ok: false, code: "http_error", status: 599 },
  );
}

function model(cookingVideo: boolean, spoken: typeof SPOKEN | null = SPOKEN) {
  generateObject.mockImplementation(async (call: { prompt?: string }) =>
    call.prompt?.startsWith("This is a short cooking video")
      ? { object: { recipe: spoken } }
      : {
          object: {
            title: "Creamy pasta",
            description: "A quick creamy pasta.",
            tags: ["pasta"],
            spaceNames: [],
            intents: [],
            recipe: null,
            cookingVideo,
          },
        },
  );
}

function transcript(text: string) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ success: true, transcript: text }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

async function tiktok(t: ReturnType<typeof newConvexTest>) {
  const userId = await t.run((ctx) => insertConsentingUser(ctx));
  return await t.run((ctx) =>
    ctx.db.insert("items", {
      userId,
      type: "link",
      url: TIKTOK,
      status: "processing",
      processingRunId: "run-1",
      processingStartedAt: Date.now(),
      tags: [],
      searchText: "",
    }),
  );
}

async function process(t: ReturnType<typeof newConvexTest>) {
  const itemId = await tiktok(t);
  await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
  return await t.run((ctx) => ctx.db.get(itemId));
}

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
  vi.stubEnv("TREG_API_KEY", "unit-test-only");
  vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "true");
  safeFetch.mockReset();
  generateObject.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  serveTikTok();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("processItem recipe from a video's speech", () => {
  it("reads the recipe a cooking TikTok says out loud", async () => {
    model(true);
    transcript("Two tablespoons of butter, a third of a cup of heavy cream.");
    const item = await process(newConvexTest());

    expect(item).toMatchObject({ status: "ready", recipe: SPOKEN });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = generateObject.mock.calls[1][0].prompt as string;
    expect(prompt).toContain("Best creamy pasta ever");
    expect(prompt).toContain("a third of a cup of heavy cream");
  });

  it("asks for the cooking flag only on a short video", async () => {
    model(true);
    transcript("Butter and cream.");
    await process(newConvexTest());
    const schema = generateObject.mock.calls[0][0].schema as {
      shape: Record<string, unknown>;
    };
    expect(Object.keys(schema.shape)).toContain("cookingVideo");
  });

  it("leaves a video that is not cooking alone", async () => {
    model(false);
    const item = await process(newConvexTest());

    expect(item?.status).toBe("ready");
    expect(item?.recipe).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the switch is off", "VIDEO_TRANSCRIPTS_ENABLED", "false"],
    ["no key is set", "TREG_API_KEY", ""],
  ])("reads no speech while %s", async (_name, key, value) => {
    vi.stubEnv(key, value);
    model(true);
    const item = await process(newConvexTest());

    expect(item?.recipe).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the save ready when the speech holds no recipe", async () => {
    model(true, null);
    transcript("La la la, summer song lyrics.");
    const item = await process(newConvexTest());

    expect(item?.status).toBe("ready");
    expect(item?.recipe).toBeUndefined();
  });

  it("keeps the save ready when Treg fails", async () => {
    model(true);
    fetchMock.mockRejectedValue(new TypeError("network"));
    const item = await process(newConvexTest());

    expect(item?.status).toBe("ready");
    expect(item?.recipe).toBeUndefined();
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("keeps the save ready when the recipe call fails", async () => {
    model(true);
    transcript("Butter and cream.");
    generateObject.mockImplementation(async (call: { prompt?: string }) => {
      if (call.prompt?.startsWith("This is a short cooking video")) {
        throw new Error("provider down");
      }
      return {
        object: {
          title: "Creamy pasta",
          description: "A quick creamy pasta.",
          tags: [],
          spaceNames: [],
          intents: [],
          recipe: null,
          cookingVideo: true,
        },
      };
    });
    const item = await process(newConvexTest());

    expect(item?.status).toBe("ready");
    expect(item?.recipe).toBeUndefined();
  });

  it("asks for a short link's transcript by the video it resolved to", async () => {
    model(true);
    transcript("Butter and cream.");
    const t = newConvexTest();
    const userId = await t.run((ctx) => insertConsentingUser(ctx));
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        url: "https://vm.tiktok.com/ZMabc123/",
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
      }),
    );
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("url")).toBe(TIKTOK);
  });

  it("keeps the save ready when the transcript claim throws", async () => {
    model(true);
    const t = newConvexTest();
    const userId = await t.run((ctx) => insertConsentingUser(ctx));
    const itemId = await t.run((ctx) =>
      ctx.db.insert("items", {
        userId,
        type: "link",
        url: TIKTOK,
        status: "processing",
        processingRunId: "run-1",
        processingStartedAt: Date.now(),
        tags: [],
        searchText: "",
      }),
    );
    const { rateLimiter } = await import("./model/rateLimiter");
    const limit = vi
      .spyOn(rateLimiter, "limit")
      .mockRejectedValue(new Error("contention"));
    await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    limit.mockRestore();

    const item = await t.run((ctx) => ctx.db.get(itemId));
    expect(item?.status).toBe("ready");
    expect(item?.recipe).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops fetching transcripts for one user past the daily burst", async () => {
    model(true);
    transcript("Butter and cream.");
    const t = newConvexTest();
    const userId = await t.run((ctx) => insertConsentingUser(ctx));
    for (let i = 0; i < 11; i++) {
      const itemId = await t.run((ctx) =>
        ctx.db.insert("items", {
          userId,
          type: "link",
          url: TIKTOK,
          status: "processing",
          processingRunId: "run-1",
          processingStartedAt: Date.now(),
          tags: [],
          searchText: "",
        }),
      );
      await t.action(internal.ai.processItem, { itemId, runId: "run-1" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

function placesModel(
  spoken: string[] | Error,
  video: {
    caption?: string[];
    cities?: string[];
    spokenCities?: string[];
    placesVideo?: boolean;
    cookingVideo?: boolean;
    captionLocations?: { name: string; location: string }[];
    spokenLocations?: { name: string; location: string }[];
  } = {},
) {
  generateObject.mockImplementation(async (call: { prompt?: string }) => {
    if (call.prompt?.startsWith("This is a short video saved")) {
      if (spoken instanceof Error) throw spoken;
      return {
        object: {
          places: spoken,
          cities: video.spokenCities ?? [],
          placeLocations: video.spokenLocations,
        },
      };
    }
    if (call.prompt?.startsWith("This is a short cooking video")) {
      return { object: { recipe: SPOKEN } };
    }
    return {
      object: {
        title: "Lisbon eats",
        description: "Where to eat in Lisbon.",
        tags: ["lisbon"],
        spaceNames: [],
        intents: [],
        recipe: null,
        cities: video.cities ?? [],
        places: video.caption ?? [],
        placeLocations: video.captionLocations,
        cookingVideo: video.cookingVideo ?? false,
        placesVideo: video.placesVideo ?? true,
      },
    };
  });
}

function speechPlacesPrompt(): string | undefined {
  const call = generateObject.mock.calls.find(([options]) =>
    (options as { prompt?: string }).prompt?.startsWith(
      "This is a short video saved",
    ),
  );
  return (call?.[0] as { prompt?: string } | undefined)?.prompt;
}

describe("processItem places from a video's speech", () => {
  it("retains caption and spoken branch clues through settlement and reruns", async () => {
    placesModel(["Carette", "Cafe"], {
      caption: ["Carette"],
      cities: ["Paris"],
      captionLocations: [{ name: "Carette", location: "Place du Trocadéro" }],
      spokenLocations: [{ name: "Cafe", location: "Rue Royale" }],
    });
    transcript("Carette at Place du Trocadéro, and Cafe on Rue Royale.");
    const t = newConvexTest();
    const item = await process(t);
    expect(item?.placeLocations).toEqual([
      { name: "Carette", location: "Place du Trocadéro" },
      { name: "Cafe", location: "Rue Royale" },
    ]);
    if (!item) throw new Error("Missing test save");
    expect(
      await t.query(internal.items.getItemInternal, { itemId: item._id }),
    ).toHaveProperty("placeLocations", item.placeLocations);
    placesModel([], { caption: ["Carette"], cities: ["Paris"] });
    await t.run((ctx) =>
      ctx.db.patch(item._id, {
        status: "processing",
        processingRunId: "run-2",
      }),
    );
    await t.action(internal.ai.processItem, {
      itemId: item._id,
      runId: "run-2",
    });
    expect(
      (await t.run((ctx) => ctx.db.get(item._id)))?.placeLocations,
    ).toEqual(item.placeLocations);
  });
  it("tries speech when TikTok has no caption to classify", async () => {
    safeFetch.mockResolvedValue({
      ok: true,
      finalUrl: TIKTOK,
      status: 200,
      contentType: "application/json",
      bytes: new TextEncoder().encode("{}"),
    });
    placesModel(["Santelmo"], { placesVideo: false, spokenCities: ["Lisbon"] });
    transcript("In Lisbon, try Santelmo.");
    const item = await process(newConvexTest());
    expect(item).toMatchObject({
      places: ["Santelmo"],
      cities: ["Lisbon"],
      placesHeard: true,
    });
  });
  describe("when oEmbed gives a TikTok no caption", () => {
    const LISBON = "5 restaurants in Lisbon: Antiga, Santelmo";

    function serveEmptyOEmbed() {
      safeFetch.mockResolvedValue({
        ok: true,
        finalUrl: TIKTOK,
        status: 200,
        contentType: "application/json",
        bytes: new TextEncoder().encode("{}"),
      });
    }

    function serveTregPost() {
      fetchMock.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ success: true, aweme_detail: { desc: LISBON } }),
            { status: 200 },
          ),
      );
    }

    function classifyPrompt(): string | undefined {
      return (
        generateObject.mock.calls[0]?.[0] as { prompt?: string } | undefined
      )?.prompt;
    }

    it("classifies the caption Treg reads", async () => {
      serveEmptyOEmbed();
      serveTregPost();
      placesModel([], {
        caption: ["Antiga", "Santelmo"],
        cities: ["Lisbon"],
        placesVideo: false,
      });
      const item = await process(newConvexTest());

      expect(classifyPrompt()).toContain(LISBON);
      expect(item).toMatchObject({
        status: "ready",
        places: ["Antiga", "Santelmo"],
        cities: ["Lisbon"],
      });
      expect(item?.enrichment).toBeUndefined();
    });

    it("sends nothing to Treg for an account that declined AI", async () => {
      serveEmptyOEmbed();
      serveTregPost();
      placesModel([], { placesVideo: false });
      const t = newConvexTest();
      const itemId = await tiktok(t);
      await t.run(async (ctx) => {
        const item = await ctx.db.get(itemId);
        await setTestConsent(ctx, item!.userId, "declined");
      });
      await t.action(internal.ai.processItem, { itemId, runId: "run-1" });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("adds the places a travel video says out loud to the caption's", async () => {
    placesModel(["Santelmo", "antiga", "Intenso"], { caption: ["Antiga"] });
    transcript("First up, Antiga. Next up is Santelmo. Then we have Intenso.");
    const item = await process(newConvexTest());

    expect(item).toMatchObject({
      status: "ready",
      places: ["Antiga", "Santelmo", "Intenso"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(speechPlacesPrompt()).toContain("Best creamy pasta ever");
    expect(speechPlacesPrompt()).toContain("Next up is Santelmo");
  });

  it("takes the cities from speech only when the caption names none", async () => {
    placesModel(["Santelmo"], { spokenCities: ["Lisbon"] });
    transcript("Santelmo in Lisbon.");
    expect((await process(newConvexTest()))?.cities).toEqual(["Lisbon"]);

    placesModel(["Santelmo"], { cities: ["Porto"], spokenCities: ["Lisbon"] });
    expect((await process(newConvexTest()))?.cities).toEqual(["Porto"]);

    transcript("Santelmo in Lisbon.");
    placesModel(["Santelmo"], {
      cities: ["Unknown"],
      spokenCities: ["Lisbon"],
    });
    expect((await process(newConvexTest()))?.cities).toEqual(["Lisbon"]);
  });

  it("reads one transcript for a cooking video that also names places", async () => {
    placesModel(["Time Out Market"], { cookingVideo: true });
    transcript("Butter and cream, from the Time Out Market.");
    const item = await process(newConvexTest());

    expect(item).toMatchObject({
      recipe: SPOKEN,
      places: ["Time Out Market"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the caption's places when the speech call fails", async () => {
    placesModel(new Error("provider down"), { caption: ["Antiga"] });
    transcript("Santelmo.");
    const item = await process(newConvexTest());

    expect(item).toMatchObject({ status: "ready", places: ["Antiga"] });
  });

  it("reads no speech for a video that names no places", async () => {
    placesModel(["Santelmo"], { caption: ["Antiga"], placesVideo: false });
    const item = await process(newConvexTest());

    expect(item?.places).toEqual(["Antiga"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads no speech while the switch is off", async () => {
    vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "false");
    placesModel(["Santelmo"], { caption: ["Antiga"] });
    const item = await process(newConvexTest());

    expect(item?.places).toEqual(["Antiga"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("on a rerun of a save whose speech was read", () => {
    async function rerun(
      prepare: () => void,
      firstRun: Parameters<typeof placesModel>[1] = {},
    ) {
      const t = newConvexTest();
      placesModel(["Santelmo", "Intenso"], {
        caption: ["Antiga"],
        ...firstRun,
      });
      transcript("Antiga, then Santelmo, then Intenso.");
      const first = await process(t);
      expect(first?.places).toEqual(["Antiga", "Santelmo", "Intenso"]);
      fetchMock.mockReset();
      generateObject.mockReset();
      prepare();
      await t.run((ctx) =>
        ctx.db.patch(first!._id, {
          status: "processing",
          processingRunId: "run-2",
          processingStartedAt: Date.now(),
        }),
      );
      await t.action(internal.ai.processItem, {
        itemId: first!._id,
        runId: "run-2",
      });
      return await t.run((ctx) => ctx.db.get(first!._id));
    }

    it("keeps the spoken places without reading the transcript again", async () => {
      const item = await rerun(() =>
        placesModel(["Santelmo"], { caption: ["Antiga"] }),
      );

      expect(item?.places).toEqual(["Antiga", "Santelmo", "Intenso"]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(speechPlacesPrompt()).toBeUndefined();
    });

    it("keeps the spoken places while the switch is off", async () => {
      const item = await rerun(() => {
        vi.stubEnv("VIDEO_TRANSCRIPTS_ENABLED", "false");
        placesModel(["Santelmo"], { caption: ["Antiga"] });
      });

      expect(item?.places).toEqual(["Antiga", "Santelmo", "Intenso"]);
    });

    it("keeps the city it heard when this run names none", async () => {
      const item = await rerun(() => placesModel([], { caption: [] }), {
        spokenCities: ["Lisbon"],
      });

      expect(item?.cities).toEqual(["Lisbon"]);
    });

    it("takes the city this run names over the stored one", async () => {
      const item = await rerun(
        () => placesModel([], { caption: ["Antiga"], cities: ["Porto"] }),
        { spokenCities: ["Lisbon"] },
      );

      expect(item?.cities).toEqual(["Porto"]);
    });

    it("reads the speech again when the first read failed", async () => {
      const t = newConvexTest();
      placesModel(["Santelmo"], { caption: ["Antiga"] });
      fetchMock.mockRejectedValue(new TypeError("network"));
      const first = await process(t);
      expect(first?.places).toEqual(["Antiga"]);
      expect(first?.placesHeard).toBeUndefined();

      placesModel(["Santelmo"], { caption: [] });
      transcript("Antiga, then Santelmo.");
      await t.run((ctx) =>
        ctx.db.patch(first!._id, {
          status: "processing",
          processingRunId: "run-2",
        }),
      );
      await t.action(internal.ai.processItem, {
        itemId: first!._id,
        runId: "run-2",
      });
      const item = await t.run((ctx) => ctx.db.get(first!._id));

      expect(item).toMatchObject({
        places: ["Santelmo", "Antiga"],
        placesHeard: true,
      });
    });
  });
});
