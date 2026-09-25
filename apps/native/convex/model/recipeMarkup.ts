/**
 * Deterministic recipe extraction from a page's structured data.
 *
 * Recipe sites publish schema.org `Recipe` markup for Google's recipe rich
 * results — as JSON-LD in nearly every case, occasionally as microdata. That
 * markup already carries the exact ingredient lines and instruction steps, so
 * reading it is free, complete (no prompt window to overflow), and never
 * hallucinated. This module is the single place the markup shapes are known;
 * the caller decides when to fall back to the model.
 *
 * The output is a raw `RecipeDraft`: line trimming, caps, deduping, and the
 * "reject when empty" rule live in the shared sanitizer so markup and model
 * recipes are bounded identically.
 *
 * Node-only (linkedom); imported from the `"use node"` action module.
 */
import { parseHTML } from "linkedom";
import type { Recipe } from "./itemFields";

/** A recipe as proposed by a source (markup or model) before sanitizing. */
export type RecipeDraft = {
  name?: string | undefined;
  servings?: string | undefined;
  ingredients: string[];
  steps: string[];
};

type JsonObject = Record<string, unknown>;

/** Nesting depth to descend while looking for Recipe nodes. Yoast's `@graph`,
 * `ItemList → ListItem → item` roundups, and `mainEntity` wrappers are all
 * within three levels; the cap denies pathological documents. */
const MAX_WALK_DEPTH = 6;
/** Hard cap on visited JSON nodes per page. */
const MAX_WALK_NODES = 2000;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when a JSON-LD node's `@type` (string or array) names a Recipe. */
function isRecipeNode(node: JsonObject): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === "string" && t.trim().toLowerCase() === "recipe",
  );
}

/** Collect every Recipe node reachable in one JSON-LD document. */
function collectRecipeNodes(root: unknown): JsonObject[] {
  const found: JsonObject[] = [];
  let visited = 0;
  const walk = (value: unknown, depth: number): void => {
    if (depth > MAX_WALK_DEPTH || visited >= MAX_WALK_NODES) {
      return;
    }
    visited++;
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(entry, depth + 1);
      }
      return;
    }
    if (!isObject(value)) {
      return;
    }
    if (isRecipeNode(value)) {
      found.push(value);
      // A Recipe never nests another Recipe worth extracting.
      return;
    }
    for (const child of Object.values(value)) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

/** Parse one `<script type="application/ld+json">` body. Sites wrap the JSON
 * in HTML comments or CDATA markers now and then; anything still malformed is
 * skipped — the page simply has no usable markup. */
function parseJsonLd(text: string): unknown {
  const stripped = text
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .replace(/^\s*\/\/\s*<!\[CDATA\[/, "")
    .replace(/\/\/\s*\]\]>\s*$/, "")
    .trim();
  if (stripped === "") {
    return undefined;
  }
  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    return undefined;
  }
}

/** Reduce a string (possibly carrying inline HTML and entities) to plain
 * text via the DOM, so every named entity decodes and every tag drops. */
type TextCleaner = (raw: string) => string;

function makeCleaner(document: Document): TextCleaner {
  const scratch = document.createElement("div");
  return (raw) => {
    scratch.innerHTML = raw;
    return (scratch.textContent ?? "").replace(/\s+/g, " ").trim();
  };
}

/** Split an instruction blob into steps at block boundaries (`<p>`, `<li>`,
 * `<br>`, newlines) and clean each. A blob with no boundaries is one step. */
function splitInstructionText(raw: string, clean: TextCleaner): string[] {
  return raw
    .replace(/<\/(p|li|div|h[1-6])>|<br\s*\/?>/gi, "\n")
    .split(/\r?\n+/)
    .map((line) => clean(line))
    .filter((line) => line !== "");
}

function stringValue(value: unknown, clean: TextCleaner): string | undefined {
  if (typeof value === "string") {
    const text = clean(value);
    return text === "" ? undefined : text;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/** `recipeYield` arrives as "4 servings", 4, ["4"], or ["4", "4 servings"]
 * (WP Recipe Maker emits the bare number first). Prefer the entry that reads
 * as a phrase; otherwise the first usable one. */
function yieldText(value: unknown, clean: TextCleaner): string | undefined {
  const entries = (Array.isArray(value) ? value : [value])
    .map((entry) => stringValue(entry, clean))
    .filter((entry): entry is string => entry !== undefined);
  return entries.find((entry) => /[a-z]/i.test(entry)) ?? entries[0];
}

function stringList(value: unknown, clean: TextCleaner): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .map((entry) => stringValue(entry, clean))
    .filter((entry): entry is string => entry !== undefined);
}

/**
 * Flatten `recipeInstructions`: a string, a list of strings, a list of
 * `HowToStep` (`text`, else `name`), `HowToSection`s carrying their own
 * `itemListElement`, or an `ItemList` wrapper. A section's name is folded into
 * its first step ("Frosting: Beat the butter…") so a flat numbered list still
 * shows which component a step belongs to.
 */
function instructionSteps(value: unknown, clean: TextCleaner): string[] {
  if (typeof value === "string") {
    return splitInstructionText(value, clean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => instructionSteps(entry, clean));
  }
  if (!isObject(value)) {
    return [];
  }
  // schema.org allows a single value wherever a list is expected, and the
  // recursion below already handles both shapes.
  if (value.itemListElement !== undefined) {
    const steps = instructionSteps(value.itemListElement, clean);
    const sectionName = stringValue(value.name, clean);
    if (sectionName !== undefined && steps.length > 0) {
      return [`${sectionName}: ${steps[0]}`, ...steps.slice(1)];
    }
    return steps;
  }
  const text = stringValue(value.text, clean) ?? stringValue(value.name, clean);
  return text === undefined ? [] : splitInstructionText(text, clean);
}

function draftFromJsonLd(node: JsonObject, clean: TextCleaner): RecipeDraft {
  return {
    name: stringValue(node.name, clean),
    servings: yieldText(node.recipeYield, clean),
    ingredients: stringList(
      node.recipeIngredient ?? node.ingredients ?? [],
      clean,
    ),
    steps: instructionSteps(node.recipeInstructions, clean),
  };
}

/**
 * One page, one recipe. Several distinct Recipe nodes mean a roundup ("12
 * weeknight dinners") — there is no single recipe to show, so none is
 * returned. Plugins that emit the same recipe twice (e.g. once standalone and
 * once inside the SEO graph) collapse to one by name.
 */
function soleRecipe(nodes: JsonObject[]): JsonObject | undefined {
  if (nodes.length === 0) {
    return undefined;
  }
  const names = new Set(
    nodes.map((node) =>
      typeof node.name === "string" ? node.name.trim().toLowerCase() : "",
    ),
  );
  return names.size === 1 ? nodes[0] : undefined;
}

function extractJsonLd(
  document: Document,
  clean: TextCleaner,
): RecipeDraft | undefined {
  const nodes: JsonObject[] = [];
  for (const script of document.querySelectorAll("script[type]")) {
    const type = (script.getAttribute("type") ?? "").trim().toLowerCase();
    if (!type.startsWith("application/ld+json")) {
      continue;
    }
    const parsed = parseJsonLd(script.textContent ?? "");
    nodes.push(...collectRecipeNodes(parsed));
  }
  const recipe = soleRecipe(nodes);
  return recipe === undefined ? undefined : draftFromJsonLd(recipe, clean);
}

/** Text of every element carrying one of the given `itemprop` names, in
 * document order. */
function microdataTexts(scope: Element, props: string[]): string[] {
  const selector = props.map((prop) => `[itemprop="${prop}"]`).join(", ");
  return Array.from(scope.querySelectorAll(selector)).map((element) =>
    (element.getAttribute("content") ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Microdata fallback for the few sites that still mark recipes up inline
 * (`itemtype="https://schema.org/Recipe"`). Instructions are either one
 * element per step or a single container whose `<li>`/`<p>` children are the
 * steps; the container's own text is split at those boundaries.
 */
function extractMicrodata(document: Document): RecipeDraft | undefined {
  const scopes = Array.from(
    document.querySelectorAll('[itemtype*="schema.org/Recipe"]'),
  );
  if (scopes.length !== 1) {
    return undefined;
  }
  const scope = scopes[0];
  const instructionNodes = Array.from(
    scope.querySelectorAll('[itemprop="recipeInstructions"]'),
  );
  const steps =
    instructionNodes.length === 1
      ? Array.from(instructionNodes[0].querySelectorAll("li, p"))
          .map((element) =>
            (element.textContent ?? "").replace(/\s+/g, " ").trim(),
          )
          .filter((text) => text !== "")
      : [];
  return {
    name: microdataTexts(scope, ["name"])[0],
    servings: microdataTexts(scope, ["recipeYield"])[0],
    ingredients: microdataTexts(scope, ["recipeIngredient", "ingredients"]),
    steps:
      steps.length > 0
        ? steps
        : instructionNodes
            .map((element) =>
              (element.textContent ?? "").replace(/\s+/g, " ").trim(),
            )
            .filter((text) => text !== ""),
  };
}

/**
 * Read the page's structured recipe, if it declares exactly one. JSON-LD is
 * checked first (the overwhelmingly common form), then microdata. Returns the
 * raw draft; callers sanitize. A page that is not a recipe, a roundup of
 * several, or one whose markup will not parse yields undefined — never an
 * error, since the page itself still saves fine.
 */
export function extractRecipeMarkup(html: string): RecipeDraft | undefined {
  try {
    const { document } = parseHTML(html);
    const clean = makeCleaner(document);
    return extractJsonLd(document, clean) ?? extractMicrodata(document);
  } catch {
    return undefined;
  }
}

// Bounds for a proposed recipe. Both reject the whole recipe rather than
// shorten it, so they sit well above what a real recipe reaches: an elaborate
// multi-component bake runs to a few thousand characters, not twenty thousand.
const MAX_RECIPE_LINES = 120;
const MAX_RECIPE_CHARS = 20000;
const MAX_RECIPE_NAME_CHARS = 120;
const MAX_RECIPE_SERVINGS_CHARS = 60;

/** Clean a proposed recipe (page markup or model) before it's persisted: trim
 * every line, drop the empty ones, and reject the whole recipe when a list
 * comes back empty (the markup is incomplete or the model is guessing) or when
 * it is too long to store.
 *
 * Nothing here shortens a recipe. The card replaces the article body, so a cut
 * instruction is a wrong recipe the reader cannot tell from a right one and
 * cannot read around; a recipe over budget is refused instead, which leaves the
 * article in place. Repeated lines are kept for the same reason: a recipe in
 * components lists the same quantity under each one, and a dough really does
 * rest twice. A rejected recipe is simply omitted — never fails the whole
 * finalize. */
export function sanitizeRecipe(
  raw: RecipeDraft | null | undefined,
): Recipe | undefined {
  if (!raw) {
    return undefined;
  }
  const clean = (lines: string[] | undefined): string[] =>
    (lines ?? []).map((line) => line.trim()).filter((line) => line !== "");
  const ingredients = clean(raw.ingredients);
  const steps = clean(raw.steps);
  if (ingredients.length === 0 || steps.length === 0) {
    return undefined;
  }
  if (
    ingredients.length > MAX_RECIPE_LINES ||
    steps.length > MAX_RECIPE_LINES
  ) {
    return undefined;
  }
  // Blank name/servings are left out entirely (not set to undefined) so the
  // persisted document never carries an explicit undefined key. Both label the
  // recipe rather than state it, so capping their length loses no instruction.
  const name = raw.name?.trim().slice(0, MAX_RECIPE_NAME_CHARS);
  const servings = raw.servings?.trim().slice(0, MAX_RECIPE_SERVINGS_CHARS);
  const recipe = {
    ...(name ? { name } : {}),
    ...(servings ? { servings } : {}),
    ingredients,
    steps,
  };
  return recipeChars(recipe) > MAX_RECIPE_CHARS ? undefined : recipe;
}

function recipeChars(recipe: Recipe): number {
  return [
    recipe.name ?? "",
    recipe.servings ?? "",
    ...recipe.ingredients,
    ...recipe.steps,
  ].reduce((total, line) => total + line.length, 0);
}
