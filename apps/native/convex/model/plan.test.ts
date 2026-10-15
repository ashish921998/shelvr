import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import { isGrounded, sanitizePlan, type PlanSource } from "./plan";

function source(fields: Partial<PlanSource>): PlanSource {
  return { itemId: "item1" as Id<"items">, places: [], ...fields };
}

describe("isGrounded", () => {
  it("matches a name written as a handle", () => {
    expect(
      isGrounded("Par Ici Café", source({ content: "dinner at @parici_cafe" })),
    ).toBe(true);
  });

  it("matches across accents and case", () => {
    expect(isGrounded("Café Lola", source({ title: "CAFE LOLA brunch" }))).toBe(
      true,
    );
  });

  it("matches a place the classifier already attached", () => {
    expect(
      isGrounded(
        "Waffle Lounge",
        source({ places: ["Waffle Lounge, Chicago"] }),
      ),
    ).toBe(true);
  });

  it("matches names in Japanese and Korean", () => {
    expect(
      isGrounded("すし匠", source({ content: "四谷のすし匠でおまかせ" })),
    ).toBe(true);
    expect(
      isGrounded("을지로 골뱅이", source({ title: "을지로 골뱅이 노포 맛집" })),
    ).toBe(true);
    expect(isGrounded("すし匠", source({ content: "最高のラーメン" }))).toBe(
      false,
    );
  });

  it("needs every distinctive word of the name", () => {
    expect(
      isGrounded("Pasta Palace", source({ title: "Great pasta tonight" })),
    ).toBe(false);
    expect(
      isGrounded("Tigre cocktail bar", source({ title: "Tigre, LES" })),
    ).toBe(true);
  });

  it("does not ground a name hidden inside other words", () => {
    expect(isGrounded("Oro", source({ title: "Best tacos in Toronto" }))).toBe(
      false,
    );
    expect(
      isGrounded("Art Bar", source({ title: "Started the party early" })),
    ).toBe(false);
    expect(
      isGrounded(
        "Ten Bells",
        source({ title: "Tender ribs, church bells at noon" }),
      ),
    ).toBe(false);
    expect(
      isGrounded("Art Bar", source({ title: "A smart barista made this" })),
    ).toBe(false);
    expect(
      isGrounded("Oro Bar", source({ title: "Toronto: Rob arrives" })),
    ).toBe(false);
    expect(isGrounded("Мир", source({ title: "Владимир" }))).toBe(false);
  });

  it("matches a name in a handle or hashtag", () => {
    expect(isGrounded("Tigre", source({ title: "#tigre on the LES" }))).toBe(
      true,
    );
    expect(isGrounded("Tigre", source({ author: "@tigrenyc" }))).toBe(true);
    expect(isGrounded("Tigre", source({ content: "#TigreNYC" }))).toBe(true);
    expect(isGrounded("Dôme", source({ author: "@domenyc" }))).toBe(true);
    expect(isGrounded("Par Ici Café", source({ author: "@parici" }))).toBe(
      true,
    );
    expect(
      isGrounded("Smith & Wollensky", source({ author: "@smithandwollensky" })),
    ).toBe(true);
    expect(
      isGrounded("Lilia", source({ content: "Dinner at @eatatlilia" })),
    ).toBe(true);
    // A short word must start the handle: "@toronto_eats" is not "Oro".
    expect(isGrounded("Oro", source({ author: "@toronto_eats" }))).toBe(false);
  });

  it("matches a name before a possessive", () => {
    expect(
      isGrounded(
        "Lilia",
        source({ content: "Lilia\u2019s pasta is worth it" }),
      ),
    ).toBe(true);
    expect(
      isGrounded("Tigre", source({ content: "Tigre's cocktails are great" })),
    ).toBe(true);
  });

  it("matches a name written without its apostrophe", () => {
    expect(
      isGrounded(
        "McSorley's Old Ale House",
        source({ content: "Beers at McSorleys Old Ale House" }),
      ),
    ).toBe(true);
    expect(
      isGrounded(
        "D’Amico & Sons",
        source({ content: "Lunch at DAmico & Sons" }),
      ),
    ).toBe(true);
  });

  it("matches a name with an apostrophe in it", () => {
    expect(
      isGrounded("L'Artusi", source({ content: "L'Artusi's olive oil cake" })),
    ).toBe(true);
    expect(
      isGrounded(
        "L'Industrie Pizzeria",
        source({ places: ["L Industrie Pizzeria, Williamsburg"] }),
      ),
    ).toBe(true);
    expect(
      isGrounded(
        "D'Angelo",
        source({ content: "D\u2019Angelo\u2019s steak sandwich" }),
      ),
    ).toBe(true);
    expect(
      isGrounded(
        "McSorley's Old Ale House",
        source({ content: "McSorley s Old Ale House" }),
      ),
    ).toBe(true);
  });

  it("matches a name run together in CamelCase", () => {
    expect(
      isGrounded(
        "Gymkhana",
        source({ content: "📍GymkhanaLondon, best dinner" }),
      ),
    ).toBe(true);
    expect(
      isGrounded(
        "L'Industrie Pizzeria",
        source({ content: "📍LIndustrieNYC burrata slice" }),
      ),
    ).toBe(true);
    expect(isGrounded("BAO", source({ content: "Cold tea #LondonBAO" }))).toBe(
      true,
    );
    expect(
      isGrounded("BAO", source({ content: "Buns!! #londonbao #soho" })),
    ).toBe(true);
    expect(
      isGrounded("Dishoom", source({ content: "📍dishoomlondon, the daal" })),
    ).toBe(true);
    expect(
      isGrounded(
        "Gymkhana",
        source({ content: "📍GYMKHANALONDON. Lamb chops" }),
      ),
    ).toBe(true);
  });

  it("matches a Latin name written inside Japanese text", () => {
    expect(
      isGrounded(
        "Tsujihan",
        source({ content: "東京でTsujihanの海鮮丼を食べた" }),
      ),
    ).toBe(true);
  });

  it("does not ground a Korean name on a different last syllable", () => {
    expect(isGrounded("마포", source({ content: "마폭 맛집 다녀옴" }))).toBe(
      false,
    );
    expect(isGrounded("마포", source({ content: "마포에서 저녁" }))).toBe(true);
    expect(isGrounded("마포", source({ content: "#마폭맛집" }))).toBe(false);
    expect(isGrounded("마포", source({ content: "#마포맛집" }))).toBe(true);
  });

  it("does not read a spaced author as one handle", () => {
    expect(isGrounded("Art Bar", source({ author: "Smart Barista" }))).toBe(
      false,
    );
    expect(isGrounded("Tigre", source({ author: "tigrenyc" }))).toBe(true);
  });

  it("matches a Korean name with a particle written onto it", () => {
    expect(
      isGrounded(
        "쵸리상경",
        source({ content: "성수동 쵸리상경에서 점심 먹었어요" }),
      ),
    ).toBe(true);
    expect(
      isGrounded(
        "쵸리상경",
        source({ content: "성수동 맛집에서 점심 먹었어요" }),
      ),
    ).toBe(false);
  });

  it("rejects a name the save never mentions", () => {
    expect(isGrounded("Carbone", source({ title: "Best pasta in NYC" }))).toBe(
      false,
    );
  });

  it("does not ground a name on generic words alone", () => {
    expect(
      isGrounded("The Wine Bar", source({ title: "the best bar for wine" })),
    ).toBe(false);
    expect(isGrounded("The Cafe", source({ title: "Cute cafe" }))).toBe(false);
    expect(
      isGrounded("Cafe", source({ title: "Cute cafe with good coffee" })),
    ).toBe(false);
  });

  it("grounds a short name the save spells out word for word", () => {
    expect(
      isGrounded(
        "Si Si",
        source({ title: "Si Si", places: ["Si Si, Brooklyn, NY"] }),
      ),
    ).toBe(true);
    expect(isGrounded("Au 79", source({ title: "Bubble tea at Au 79" }))).toBe(
      true,
    );
    expect(isGrounded("Si Si", source({ title: "This is it" }))).toBe(false);
    expect(isGrounded("Go", source({ title: "Go try the vodka pasta" }))).toBe(
      false,
    );
    expect(isGrounded("A", source({ title: "A great night out" }))).toBe(false);
  });
});

describe("sanitizePlan", () => {
  it("caps the shortlist at five places", () => {
    const sources = Array.from({ length: 7 }, (_, i) =>
      source({
        itemId: `item${i}` as Id<"items">,
        title: `Spot${i} dinner`,
      }),
    );
    const raw = sources.map((_, i) => ({
      saveNumber: i + 1,
      name: `Spot${i}`,
      area: "",
      why: "Good",
    }));
    expect(sanitizePlan(raw, sources)).toHaveLength(5);
  });

  it("keeps an area only when the save mentions it", () => {
    const sources = [source({ title: "Balthazar in SoHo" })];
    const [kept] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "SoHo", why: "Go" }],
      sources,
    );
    expect(kept.area).toBe("SoHo");
    const [dropped] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "Brooklyn", why: "Go" }],
      sources,
    );
    expect(dropped.area).toBeUndefined();
  });

  it("drops a city the save does not name", () => {
    const sources = [source({ title: "Balthazar, SoHo, New York" })];
    const [pick] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "SoHo, London", why: "Go" }],
      sources,
    );
    expect(pick.area).toBe("SoHo");
    const [whole] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "SoHo, New York", why: "Go" }],
      sources,
    );
    expect(whole.area).toBe("SoHo, New York");
  });

  it("drops the region and country a save never names", () => {
    const [pick] = sanitizePlan(
      [
        {
          saveNumber: 1,
          name: "Lola",
          area: "London, Ontario, Canada",
          why: "Go",
        },
      ],
      [source({ title: "Lola in London" })],
    );
    expect(pick.area).toBe("London");
  });

  it("keeps a short state code only when the save names it", () => {
    const sources = [source({ title: "Balthazar in Springfield, IL" })];
    const [kept] = sanitizePlan(
      [
        {
          saveNumber: 1,
          name: "Balthazar",
          area: "Springfield, IL",
          why: "Go",
        },
      ],
      sources,
    );
    expect(kept.area).toBe("Springfield, IL");
    const [dropped] = sanitizePlan(
      [
        {
          saveNumber: 1,
          name: "Balthazar",
          area: "Springfield, MO",
          why: "Go",
        },
      ],
      sources,
    );
    expect(dropped.area).toBe("Springfield");
  });

  it("drops picks with an empty reason and trims long fields", () => {
    const sources = [source({ title: "Balthazar" })];
    expect(
      sanitizePlan(
        [{ saveNumber: 1, name: "Balthazar", area: "", why: "   " }],
        sources,
      ),
    ).toEqual([]);
    const [place] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "", why: "x".repeat(300) }],
      sources,
    );
    expect(place.why.length).toBeLessThanOrEqual(140);
  });
});
