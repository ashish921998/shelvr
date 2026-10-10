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
      [{ saveNumber: 1, name: "Balthazar", area: "SoHo, NYC", why: "Go" }],
      sources,
    );
    expect(kept.area).toBe("SoHo, NYC");
    const [dropped] = sanitizePlan(
      [{ saveNumber: 1, name: "Balthazar", area: "Brooklyn", why: "Go" }],
      sources,
    );
    expect(dropped.area).toBeUndefined();
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
