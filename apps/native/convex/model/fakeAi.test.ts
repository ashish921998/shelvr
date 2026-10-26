import { generateObject, generateText } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  FAKE_AI_PLACEHOLDER_KEY,
  FAKE_AI_SWITCH,
  FAKE_MODEL,
  FakeAiUnansweredError,
  fakeAiLocks,
  fakeLinkAnalysis,
  fakeNoteAnalysis,
  fakePlan,
  fakeRecommendation,
  FIXTURE_ORIGIN,
  fixturePage,
  noteFromPrompt,
  pageFromPrompt,
} from "./fakeAi";

const LOCAL = {
  E2E_FAKE_AI: FAKE_AI_SWITCH,
  AUTH_ENABLE_ANONYMOUS: "true",
  GOOGLE_GENERATIVE_AI_API_KEY: FAKE_AI_PLACEHOLDER_KEY,
  CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
};

describe("fakeAiLocks", () => {
  it("turns the fake on only when every lock holds", () => {
    expect(fakeAiLocks(LOCAL)).toEqual({ enabled: true });
  });

  it.each([undefined, "", "true", "1", "local-v2"])(
    "stays off for the switch value %s",
    (value) => {
      expect(fakeAiLocks({ ...LOCAL, E2E_FAKE_AI: value })).toEqual({
        enabled: false,
        refusedBy: "switch_off",
      });
    },
  );

  it.each([
    undefined,
    "https://amiable-setter-120.convex.cloud",
    "http://localhost:3210",
    "http://127.0.0.1.example.com:3210",
    "not a url",
  ])("refuses a backend at %s", (url) => {
    expect(fakeAiLocks({ ...LOCAL, CONVEX_CLOUD_URL: url })).toEqual({
      enabled: false,
      refusedBy: "not_local",
    });
  });

  it.each([undefined, "false", "TRUE"])(
    "refuses when dev sign-in is %s",
    (value) => {
      expect(fakeAiLocks({ ...LOCAL, AUTH_ENABLE_ANONYMOUS: value })).toEqual({
        enabled: false,
        refusedBy: "dev_sign_in_off",
      });
    },
  );

  it.each([undefined, "", "AIzaSyExampleRealLookingKey"])(
    "refuses the model key %s",
    (key) => {
      expect(
        fakeAiLocks({ ...LOCAL, GOOGLE_GENERATIVE_AI_API_KEY: key }),
      ).toEqual({ enabled: false, refusedBy: "real_key" });
    },
  );
});

describe("fakeNoteAnalysis", () => {
  it("titles, describes and tags a note from its own words", () => {
    expect(
      fakeNoteAnalysis("Ask the landlord about the quokka mural.\nSoon"),
    ).toEqual({
      title: "Ask the landlord about the quokka",
      description: "Ask the landlord about the quokka mural.",
      tags: ["landlord", "about", "quokka", "mural", "soon"],
      spaceNames: [],
      intents: [],
      cities: [],
      places: [],
    });
  });

  it("keeps at most six unique tags", () => {
    const { tags } = fakeNoteAnalysis(
      "alpha alpha bravo charlie delta echo foxtrot golf hotel",
    );
    expect(tags).toEqual([
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
    ]);
  });
});

function notePrompt(note: string): string {
  return [
    "You are helping organize a save-it-for-later app. Analyze this saved note and produce a short evocative title.",
    "Existing spaces: none",
    `Note:\n${note}`,
    "Also propose up to 5 useful actions ('intents') the user could take on this item.",
  ].join("\n\n");
}

describe("noteFromPrompt", () => {
  it("reads the note, blank lines included", () => {
    expect(noteFromPrompt(notePrompt("First\n\nSecond"))).toBe(
      "First\n\nSecond",
    );
  });

  it("ignores a prompt that is not a note's", () => {
    expect(
      noteFromPrompt(
        "Analyze this saved link.\n\nNote:\nquokka\n\nAlso propose up to 5",
      ),
    ).toBeUndefined();
    expect(
      noteFromPrompt("Analyze this saved note.\n\nAlso propose up to 5"),
    ).toBeUndefined();
  });
});

const noteSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  spaceNames: z.array(z.string()),
  intents: z.array(z.object({ kind: z.string() })),
  cities: z.array(z.string()),
  places: z.array(z.string()),
});

describe("FAKE_MODEL", () => {
  it("answers a note classification through generateObject", async () => {
    const { object } = await generateObject({
      model: FAKE_MODEL,
      schema: noteSchema,
      prompt: notePrompt("Ask the landlord about the quokka mural"),
    });
    expect(object.title).toBe("Ask the landlord about the quokka");
    expect(object.tags).toContain("quokka");
  });

  it("fails a call it has no answer for", async () => {
    await expect(
      generateObject({
        model: FAKE_MODEL,
        schema: z.object({ title: z.string() }),
        prompt: notePrompt("quokka"),
      }),
    ).rejects.toThrow(FakeAiUnansweredError);
    await expect(
      generateText({ model: FAKE_MODEL, prompt: notePrompt("quokka") }),
    ).rejects.toThrow(FakeAiUnansweredError);
  });
});

function linkPrompt(content: string): string {
  return [
    "You are helping organize a save-it-for-later app. Analyze this saved web page and produce a title.",
    "Existing spaces: none",
    `URL: ${FIXTURE_ORIGIN}/quince-paste`,
    "Page title: Quince paste for beginners",
    "Site: Shelvr fixtures",
    "Meta description: How to cook membrillo.",
    `Page content:\n${content}`,
    "Also propose up to 5 useful actions ('intents') the user could take on this item.",
  ].join("\n\n");
}

describe("pageFromPrompt", () => {
  it("reads the title, description and text, blank lines included", () => {
    expect(pageFromPrompt(linkPrompt("Cook it.\n\nServe it."))).toEqual({
      title: "Quince paste for beginners",
      description: "How to cook membrillo.",
      content: "Cook it.\n\nServe it.",
    });
  });

  it("ignores a prompt that is not a web page's", () => {
    expect(pageFromPrompt(notePrompt("Page title: x"))).toBeUndefined();
  });
});

describe("fakeLinkAnalysis", () => {
  it("keeps the page's own title and description", () => {
    expect(
      fakeLinkAnalysis({
        title: "Quince paste for beginners",
        description: "How to cook membrillo.",
        content: "Membrillo sets slowly.",
      }),
    ).toEqual({
      title: "Quince paste for beginners",
      description: "How to cook membrillo.",
      tags: ["quince", "paste", "beginners", "membrillo", "sets", "slowly"],
      spaceNames: [],
      intents: [],
      cities: [],
      places: [],
    });
  });

  it("leaves a page with no title unanswered", () => {
    expect(fakeLinkAnalysis({ content: "text" })).toBeUndefined();
  });
});

describe("fakePlan", () => {
  const prompt = (saves: string) =>
    [
      "You help someone decide where to actually go, using what they saved.",
      saves,
    ].join("\n\n");

  it("picks every place each save lists, numbered by its save", () => {
    expect(
      fakePlan(
        prompt(
          "Save 1\nTitle: No places here\n\nSave 2\nTitle: Date night\nPlaces: Manteigaria; Miradouro da Graça",
        ),
      ),
    ).toEqual({
      places: [
        {
          saveNumber: 2,
          name: "Manteigaria",
          area: "",
          why: "Saved for a night out",
        },
        {
          saveNumber: 2,
          name: "Miradouro da Graça",
          area: "",
          why: "Saved for a night out",
        },
      ],
    });
  });

  it("leaves a prompt that is not a plan unanswered", () => {
    expect(fakePlan("Save 1\nPlaces: Manteigaria")).toBeUndefined();
  });
});

describe("fixturePage", () => {
  it("serves a fixture page only at the fixture origin", () => {
    expect(fixturePage(`${FIXTURE_ORIGIN}/quince-paste`)?.title).toBe(
      "Quince paste for beginners",
    );
    expect(fixturePage(`${FIXTURE_ORIGIN}/missing`)).toBeUndefined();
    expect(fixturePage("https://example.com/quince-paste")).toBeUndefined();
    expect(fixturePage("not a url")).toBeUndefined();
  });
});

describe("FAKE_MODEL on a link", () => {
  it("answers a web page classification through generateObject", async () => {
    const { object } = await generateObject({
      model: FAKE_MODEL,
      schema: noteSchema,
      prompt: linkPrompt("Membrillo sets slowly."),
    });
    expect(object.title).toBe("Quince paste for beginners");
  });

  it("fails a recipe-shaped call", async () => {
    await expect(
      generateObject({
        model: FAKE_MODEL,
        schema: noteSchema.extend({ recipe: z.string().nullable() }),
        prompt: linkPrompt("Membrillo sets slowly."),
      }),
    ).rejects.toThrow(FakeAiUnansweredError);
  });
});

function recommendPrompt(spaceName: string, description = "Bowls"): string {
  return [
    "You are helping organize a save-it-for-later app. The user just created a space (a themed collection).",
    `Space name: "${spaceName}"\nSpace description: ${description}`,
    "Below is a numbered list of the user's saved items.",
    [
      "1. Weeknight Miso Ramen — A fast ramen recipe — tags: recipes, dinner",
      "2. Belém Tower — A saved place in Lisbon",
      "3. Ramen bars in Tokyo — tags: travel",
    ].join("\n"),
  ].join("\n\n");
}

describe("fakeRecommendation", () => {
  it("picks the saves that share a word with the space name", () => {
    expect(fakeRecommendation(recommendPrompt("Ramen 1760"))).toEqual({
      itemNumbers: [1, 3],
    });
  });

  it("reads numbered lines only from the saves, not the description", () => {
    expect(
      fakeRecommendation(recommendPrompt("Ramen 1760", "2. Ramen to try")),
    ).toEqual({ itemNumbers: [1, 3] });
  });

  it("keeps a blank or numbered line in a save's description inside it", () => {
    const prompt = recommendPrompt("Lisbon 1760").replace(
      "A fast ramen recipe",
      "A fast ramen recipe\n\n5. Lisbon tram",
    );
    expect(fakeRecommendation(prompt)).toEqual({ itemNumbers: [1, 2] });
  });

  it("picks nothing when no save shares one", () => {
    expect(fakeRecommendation(recommendPrompt("Pilot 1760"))).toEqual({
      itemNumbers: [],
    });
  });

  it("leaves a prompt that is not a recommendation unanswered", () => {
    expect(fakeRecommendation(notePrompt('Space name: "Ramen"'))).toBe(
      undefined,
    );
  });
});

describe("FAKE_MODEL on a recommendation", () => {
  const schema = z.object({ itemNumbers: z.array(z.number().int()) });

  it("answers through generateObject", async () => {
    const { object } = await generateObject({
      model: FAKE_MODEL,
      schema,
      prompt: recommendPrompt("Lisbon"),
    });
    expect(object.itemNumbers).toEqual([2]);
  });

  it("fails a recommendation schema on another prompt", async () => {
    await expect(
      generateObject({ model: FAKE_MODEL, schema, prompt: notePrompt("x") }),
    ).rejects.toThrow(FakeAiUnansweredError);
  });
});
