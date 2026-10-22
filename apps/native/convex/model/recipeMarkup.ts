import { parseHTML } from "linkedom";
import type { Recipe } from "./itemFields";

export type RecipeDraft = {
  name?: string | undefined;
  servings?: string | undefined;
  ingredients: string[];
  steps: string[];
};

type JsonObject = Record<string, unknown>;

const MAX_WALK_DEPTH = 6;
const MAX_WALK_NODES = 2000;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecipeNode(node: JsonObject): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === "string" && t.trim().toLowerCase() === "recipe",
  );
}

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
      return;
    }
    for (const child of Object.values(value)) {
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

function parseJsonLd(text: string): unknown {
  const stripped = text
    .replace(/^\s*<!--/, "")
    .replace(/--!?>\s*$/, "")
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

type TextCleaner = (raw: string) => string;

function makeCleaner(document: Document): TextCleaner {
  const scratch = document.createElement("div");
  return (raw) => {
    scratch.innerHTML = raw;
    return (scratch.textContent ?? "").replace(/\s+/g, " ").trim();
  };
}

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
  if (value.itemListElement !== undefined) {
    const steps = instructionSteps(value.itemListElement, clean);
    const sectionName = trimTrailingColons(stringValue(value.name, clean));
    if (sectionName && steps.length > 0) {
      return [`${sectionName}: ${steps[0]}`, ...steps.slice(1)];
    }
    return steps;
  }
  const text = stringValue(value.text, clean) ?? stringValue(value.name, clean);
  return text === undefined ? [] : splitInstructionText(text, clean);
}

function tidyIngredient(text: string): string {
  if (!text.endsWith(")")) return text;
  let depth = 0;
  let open = text.length - 1;
  for (; open >= 0; open -= 1) {
    if (text[open] === ")") depth += 1;
    else if (text[open] === "(" && --depth === 0) break;
  }
  if (open < 1 || text[open - 1] !== " ") return text;
  const notes = text.slice(open + 1, -1);
  if (/^,\s*\S/.test(notes)) return text.slice(0, open - 1) + notes;
  if (/^\(\s*[^\s)]/.test(notes)) {
    return text.slice(0, open) + notes;
  }
  return text;
}

function trimTrailingColons(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  let end = text.length;
  while (end > 0 && text[end - 1] === ":") end -= 1;
  return text.slice(0, end);
}

function draftFromJsonLd(node: JsonObject, clean: TextCleaner): RecipeDraft {
  return {
    name: stringValue(node.name, clean),
    servings: yieldText(node.recipeYield, clean),
    ingredients: stringList(
      node.recipeIngredient ?? node.ingredients ?? [],
      clean,
    ).map(tidyIngredient),
    steps: instructionSteps(node.recipeInstructions, clean),
  };
}

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

function microdataTexts(scope: Element, props: string[]): string[] {
  const selector = props.map((prop) => `[itemprop="${prop}"]`).join(", ");
  return Array.from(scope.querySelectorAll(selector)).map((element) =>
    (element.getAttribute("content") ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

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

export function extractRecipeMarkup(html: string): RecipeDraft | undefined {
  try {
    const { document } = parseHTML(html);
    const clean = makeCleaner(document);
    return extractJsonLd(document, clean) ?? extractMicrodata(document);
  } catch {
    return undefined;
  }
}

const MAX_RECIPE_LINES = 120;
const MAX_RECIPE_CHARS = 20000;
const MAX_RECIPE_NAME_CHARS = 120;
const MAX_RECIPE_SERVINGS_CHARS = 60;

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
