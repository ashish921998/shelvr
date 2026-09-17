import { describe, expect, it } from "vitest";
import { extractRecipeMarkup } from "./recipeMarkup";

function page(body: string): string {
  return `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;
}

function jsonLd(data: unknown, attrs = 'type="application/ld+json"'): string {
  return `<script ${attrs}>${JSON.stringify(data)}</script>`;
}

const BASIC_RECIPE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Weeknight Dal",
  recipeYield: "4 servings",
  recipeIngredient: ["1 cup red lentils", "2 cups water"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Rinse the lentils." },
    { "@type": "HowToStep", text: "Simmer for 20 minutes." },
  ],
};

describe("extractRecipeMarkup", () => {
  it("reads a plain Recipe node with HowToStep instructions", () => {
    expect(extractRecipeMarkup(page(jsonLd(BASIC_RECIPE)))).toStrictEqual({
      name: "Weeknight Dal",
      servings: "4 servings",
      ingredients: ["1 cup red lentils", "2 cups water"],
      steps: ["Rinse the lentils.", "Simmer for 20 minutes."],
    });
  });

  it("finds the Recipe inside a Yoast @graph with an array @type and an unquoted script type", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Dal | Blog" },
        { "@type": "Person", name: "Author" },
        { ...BASIC_RECIPE, "@type": ["Recipe", "NewsArticle"] },
      ],
    };
    const recipe = extractRecipeMarkup(
      page(jsonLd(graph, "type=application/ld+json class=yoast-schema-graph")),
    );
    expect(recipe?.name).toBe("Weeknight Dal");
    expect(recipe?.ingredients).toHaveLength(2);
  });

  it("returns nothing for a roundup listing several distinct recipes", () => {
    const roundup = {
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", position: 1, item: BASIC_RECIPE },
        {
          "@type": "ListItem",
          position: 2,
          item: { ...BASIC_RECIPE, name: "Chana Masala" },
        },
      ],
    };
    expect(extractRecipeMarkup(page(jsonLd(roundup)))).toBeUndefined();
  });

  it("collapses the same recipe emitted twice by two plugins", () => {
    const html = page(
      jsonLd(BASIC_RECIPE) +
        jsonLd({ "@graph": [{ ...BASIC_RECIPE, name: " weeknight dal " }] }),
    );
    expect(extractRecipeMarkup(html)?.ingredients).toHaveLength(2);
  });

  it("returns nothing when no Recipe node exists", () => {
    const article = {
      "@type": "Article",
      name: "Why I love lentils",
      recipeIngredient: ["not a recipe"],
    };
    expect(extractRecipeMarkup(page(jsonLd(article)))).toBeUndefined();
    expect(extractRecipeMarkup(page("<p>hello</p>"))).toBeUndefined();
  });

  it("prefers the phrased recipeYield entry over the bare number and accepts numbers", () => {
    expect(
      extractRecipeMarkup(
        page(jsonLd({ ...BASIC_RECIPE, recipeYield: ["4", "4 servings"] })),
      )?.servings,
    ).toBe("4 servings");
    expect(
      extractRecipeMarkup(page(jsonLd({ ...BASIC_RECIPE, recipeYield: ["6"] })))
        ?.servings,
    ).toBe("6");
    expect(
      extractRecipeMarkup(page(jsonLd({ ...BASIC_RECIPE, recipeYield: 12 })))
        ?.servings,
    ).toBe("12");
    expect(
      extractRecipeMarkup(
        page(jsonLd({ ...BASIC_RECIPE, recipeYield: undefined })),
      )?.servings,
    ).toBeUndefined();
  });

  it("folds HowToSection names into their first step and keeps section order", () => {
    const sectioned = {
      ...BASIC_RECIPE,
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Cake",
          itemListElement: [
            { "@type": "HowToStep", text: "Cream the butter." },
            { "@type": "HowToStep", text: "Bake 30 minutes." },
          ],
        },
        {
          "@type": "HowToSection",
          name: "Frosting",
          itemListElement: [{ "@type": "HowToStep", text: "Whip the cream." }],
        },
      ],
    };
    expect(extractRecipeMarkup(page(jsonLd(sectioned)))?.steps).toStrictEqual([
      "Cake: Cream the butter.",
      "Bake 30 minutes.",
      "Frosting: Whip the cream.",
    ]);
  });

  it("reads a section whose itemListElement is one step rather than a list", () => {
    // schema.org allows a single value where a list is expected. Without the
    // unwrapping the section falls through to its own name, so the step text
    // is replaced by the heading it sits under.
    const sectioned = {
      ...BASIC_RECIPE,
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Frosting",
          itemListElement: { "@type": "HowToStep", text: "Whip the cream." },
        },
      ],
    };
    expect(extractRecipeMarkup(page(jsonLd(sectioned)))?.steps).toStrictEqual([
      "Frosting: Whip the cream.",
    ]);
  });

  it("splits a single HTML instruction string into steps and decodes entities and tags", () => {
    const blob = {
      ...BASIC_RECIPE,
      recipeIngredient: ["1&frac12; cups <b>flour</b>", "&#189; tsp salt"],
      recipeInstructions:
        "<p>Mix the dry ingredients&nbsp;well.</p><p>Fold in the wet &amp; rest.</p>",
    };
    expect(extractRecipeMarkup(page(jsonLd(blob)))).toStrictEqual({
      name: "Weeknight Dal",
      servings: "4 servings",
      ingredients: ["1½ cups flour", "½ tsp salt"],
      steps: ["Mix the dry ingredients well.", "Fold in the wet & rest."],
    });
  });

  it("accepts a newline-separated instruction string and a HowToStep with only a name", () => {
    const recipe = {
      ...BASIC_RECIPE,
      recipeInstructions: [
        "Step one.\nStep two.",
        { "@type": "HowToStep", name: "Step three." },
      ],
    };
    expect(extractRecipeMarkup(page(jsonLd(recipe)))?.steps).toStrictEqual([
      "Step one.",
      "Step two.",
      "Step three.",
    ]);
  });

  it("falls back to the legacy `ingredients` property", () => {
    const legacy = {
      ...BASIC_RECIPE,
      recipeIngredient: undefined,
      ingredients: ["1 onion"],
    };
    expect(
      extractRecipeMarkup(page(jsonLd(legacy)))?.ingredients,
    ).toStrictEqual(["1 onion"]);
  });

  it("skips malformed JSON-LD and reads the next script", () => {
    const html = page(
      `<script type="application/ld+json">{ not json </script>` +
        jsonLd(BASIC_RECIPE),
    );
    expect(extractRecipeMarkup(html)?.name).toBe("Weeknight Dal");
  });

  it("tolerates HTML-comment wrapped JSON-LD", () => {
    const html = page(
      `<script type="application/ld+json"><!--${JSON.stringify(BASIC_RECIPE)}--></script>`,
    );
    expect(extractRecipeMarkup(html)?.name).toBe("Weeknight Dal");
  });

  it("reads microdata when there is no JSON-LD", () => {
    const html = page(`
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Apple Tarte Tatin</h1>
        <span itemprop="recipeYield">8 servings</span>
        <ul>
          <li itemprop="recipeIngredient">6 apples</li>
          <li itemprop="recipeIngredient">1 cup <em>sugar</em></li>
        </ul>
        <div itemprop="recipeInstructions">
          <p>Peel the apples.</p>
          <p>Caramelize the sugar.</p>
        </div>
      </div>`);
    expect(extractRecipeMarkup(html)).toStrictEqual({
      name: "Apple Tarte Tatin",
      servings: "8 servings",
      ingredients: ["6 apples", "1 cup sugar"],
      steps: ["Peel the apples.", "Caramelize the sugar."],
    });
  });

  it("reads one-element-per-step microdata instructions and ignores multi-recipe pages", () => {
    const one = page(`
      <article itemscope itemtype="http://schema.org/Recipe">
        <span itemprop="name">Toast</span>
        <span itemprop="recipeIngredient">1 slice bread</span>
        <li itemprop="recipeInstructions">Toast it.</li>
        <li itemprop="recipeInstructions">Butter it.</li>
      </article>`);
    expect(extractRecipeMarkup(one)?.steps).toStrictEqual([
      "Toast it.",
      "Butter it.",
    ]);
    const two = page(`
      <div itemscope itemtype="http://schema.org/Recipe"><span itemprop="name">A</span></div>
      <div itemscope itemtype="http://schema.org/Recipe"><span itemprop="name">B</span></div>`);
    expect(extractRecipeMarkup(two)).toBeUndefined();
  });

  it("stops descending at the depth cap instead of walking unbounded nesting", () => {
    let nested: unknown = BASIC_RECIPE;
    for (let i = 0; i < 10; i++) {
      nested = { wrapper: nested };
    }
    expect(extractRecipeMarkup(page(jsonLd(nested)))).toBeUndefined();
  });
});
