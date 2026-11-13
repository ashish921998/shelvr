import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { ArticleMedia, PostMedia, Recipe } from "./itemFields";
import type { PageData } from "./pageRead";
import type { Classification, Reading, Settlement } from "./settlement";

const MODES = {
  allowed: { asked: "granted", committed: "granted" },
  late: { asked: "granted", committed: "declined" },
  early: { asked: "declined", committed: "declined" },
} as const;

type Mode = keyof typeof MODES;

type Shape = "rich" | "noRecipe" | "empty";

export type Scenario = {
  id: string;
  kind: "link" | "note" | "image";
  before: "fresh" | "retried";
  lock: "none" | "typed" | "refresh";
  mode: Mode;
  page: Shape;
  model: Shape;
  title: "model" | "blank";
  cities: "sent" | "omitted";
  poster: "none" | "same" | "replaced";
  hadPoster: boolean;
  enrichment: Reading["enrichment"];
};

export type GridIds = {
  poster: Id<"_storage">;
  newPoster: Id<"_storage">;
  image: Id<"_storage">;
};

const RUN_ID = "run-1";
const NOTE_FIRST_LINE = "First line";
const NOTE_TEXT = `${NOTE_FIRST_LINE}\nSecond line`;
const PAGE_RECIPE: Recipe = {
  name: "Page recipe",
  ingredients: ["page ingredient"],
  steps: ["page step"],
};
const MODEL_RECIPE = {
  name: "Model recipe",
  ingredients: ["model ingredient"],
  steps: ["model step"],
};
const OLD_RECIPE: Recipe = {
  ingredients: ["old ingredient"],
  steps: ["old step"],
};
const NEW_MEDIA: PostMedia[] = [
  { kind: "photo", imageUrl: "https://img.example/new.jpg", aspectRatio: 1.5 },
];
const OLD_MEDIA: PostMedia[] = [
  { kind: "photo", imageUrl: "https://img.example/old.jpg", aspectRatio: 0.75 },
];
const NEW_ARTICLE_MEDIA: ArticleMedia[] = [
  {
    kind: "photo",
    imageUrl: "https://img.example/new-article.jpg",
    aspectRatio: 1,
    paragraph: 2,
  },
];
const OLD_ARTICLE_MEDIA: ArticleMedia[] = [
  {
    kind: "photo",
    imageUrl: "https://img.example/old-article.jpg",
    aspectRatio: 1,
    paragraph: 1,
  },
];

const PAGE: PageData = {
  title: "Page title",
  description: "Page description",
  content: "Page content",
  siteName: "Page site",
  author: "Page author",
  heroImageUrl: "https://img.example/hero.jpg",
  heroAspectRatio: 1.5,
  media: NEW_MEDIA,
};

const PAGES: Record<Shape, PageData> = {
  rich: { ...PAGE, recipe: PAGE_RECIPE },
  noRecipe: PAGE,
  empty: {},
};

const MODEL: Classification = {
  title: "Model title",
  description: "Model description",
  tags: ["model", "tag"],
  intents: [
    { kind: "open_url", label: "Open", value: "https://example.com/model" },
  ],
  cities: ["Paris"],
};

const MODELS: Record<Shape, Classification> = {
  rich: { ...MODEL, recipe: MODEL_RECIPE },
  noRecipe: MODEL,
  empty: { description: "", tags: [], intents: [], cities: [] },
};

const RETRIED = {
  title: "Old title",
  description: "Old description",
  tags: ["old"],
  content: "Old content",
  recipe: OLD_RECIPE,
  siteName: "Old site",
  author: "Old author",
  heroImageUrl: "https://img.example/old-hero.jpg",
  media: OLD_MEDIA,
  articleMedia: OLD_ARTICLE_MEDIA,
  intents: [{ kind: "copy" as const, label: "Copy", value: "old value" }],
  cities: ["Old City"],
  searchText: "old searchtext",
  failureReason: "error" as const,
  enrichment: "partial" as const,
};

const BASE: Omit<Scenario, "id"> = {
  kind: "link",
  before: "fresh",
  lock: "none",
  mode: "allowed",
  page: "rich",
  model: "rich",
  title: "model",
  cities: "sent",
  poster: "none",
  hadPoster: false,
  enrichment: undefined,
};

const KINDS = ["link", "note", "image"] as const;
const BEFORES = ["fresh", "retried"] as const;
const LOCKS = ["none", "typed", "refresh"] as const;
const RUN_MODES = ["allowed", "late", "early"] as const;

function scenario(
  id: string,
  overrides: Partial<Omit<Scenario, "id">>,
): Scenario {
  return { ...BASE, ...overrides, id };
}

function product<A extends Record<string, readonly unknown[]>>(
  axes: A,
): { [K in keyof A]: A[K][number] }[] {
  let rows: Record<string, unknown>[] = [{}];
  for (const [key, values] of Object.entries(axes)) {
    rows = rows.flatMap((row) =>
      values.map((value) => ({ ...row, [key]: value })),
    );
  }
  return rows as { [K in keyof A]: A[K][number] }[];
}

const core = product({
  kind: KINDS,
  before: BEFORES,
  lock: LOCKS,
  mode: RUN_MODES,
  shape: ["rich", "empty"] as const,
}).map(({ shape, ...axes }) =>
  scenario(
    `core/${axes.kind}/${axes.before}/${axes.lock}/${axes.mode}/${shape}`,
    { ...axes, page: shape, model: shape },
  ),
);

const POSTERS = [
  [false, "none"],
  [false, "replaced"],
  [true, "none"],
  [true, "same"],
  [true, "replaced"],
] as const;

const posters = (["allowed", "early"] as const).flatMap((mode) =>
  POSTERS.map(([hadPoster, poster]) =>
    scenario(`poster/${mode}/${hadPoster ? "had" : "none"}/${poster}`, {
      mode,
      hadPoster,
      poster,
    }),
  ),
);

const enrichments = ([undefined, "partial", "no_article"] as const).flatMap(
  (enrichment) =>
    BEFORES.map((before) =>
      scenario(`enrichment/${enrichment ?? "none"}/${before}`, {
        before,
        enrichment,
      }),
    ),
);

const RECIPE_SOURCES = [
  ["pageOnly", "rich", "noRecipe"],
  ["modelOnly", "noRecipe", "rich"],
  ["neither", "noRecipe", "noRecipe"],
] as const;

const recipes = product({
  before: BEFORES,
  mode: RUN_MODES,
  source: RECIPE_SOURCES,
}).map(({ source: [name, page, model], ...axes }) =>
  scenario(`recipe/${name}/${axes.mode}/${axes.before}`, {
    ...axes,
    page,
    model,
  }),
);

const omittedCities = product({
  mode: ["allowed"] as const,
  before: BEFORES,
}).map((axes) =>
  scenario(`cities/omitted/${axes.mode}/${axes.before}`, {
    ...axes,
    cities: "omitted",
  }),
);

const blankTitles = product({
  mode: ["allowed", "late"] as const,
  before: BEFORES,
  lock: LOCKS,
}).map((axes) =>
  scenario(`title/blank/${axes.mode}/${axes.before}/${axes.lock}`, {
    ...axes,
    title: "blank",
  }),
);

export const SCENARIOS: Scenario[] = [
  ...core,
  ...posters,
  ...enrichments,
  ...recipes,
  ...omittedCities,
  ...blankTitles,
];

export function consentOf(mode: Mode): "granted" | "declined" {
  return MODES[mode].committed;
}

export function itemFields(
  s: Scenario,
  ids: GridIds,
  userId: string,
): WithoutSystemFields<Doc<"items">> {
  const retried = s.before === "retried";
  return {
    userId,
    type: s.kind,
    status: retried ? "failed" : "processing",
    processingRunId: RUN_ID,
    tags: [],
    searchText: "",
    ...(s.kind === "link" ? { url: "https://example.com/saved" } : {}),
    ...(s.kind === "note" ? { note: NOTE_TEXT } : {}),
    ...(s.kind === "image" ? { storageId: ids.image, aspectRatio: 1.25 } : {}),
    ...(retried ? RETRIED : {}),
    ...(s.lock === "typed"
      ? { title: "Typed title", titleSource: "user" as const }
      : {}),
    ...(s.hadPoster ? { storageId: ids.poster } : {}),
  };
}

function posterId(
  poster: Scenario["poster"],
  ids: GridIds,
): Id<"_storage"> | undefined {
  if (poster === "same") return ids.poster;
  return poster === "replaced" ? ids.newPoster : undefined;
}

function readingFor(s: Scenario, item: Doc<"items">, ids: GridIds): Reading {
  const page = s.kind === "link" ? PAGES[s.page] : undefined;
  return {
    title: s.kind === "note" ? NOTE_FIRST_LINE : page?.title,
    description: page?.description,
    recipe: page?.recipe,
    content: page?.content,
    siteName: page?.siteName,
    author: page?.author,
    heroImageUrl: page?.heroImageUrl,
    media: page?.media,
    articleMedia: s.page === "rich" && page ? NEW_ARTICLE_MEDIA : undefined,
    storageId: posterId(s.poster, ids),
    aspectRatio: s.kind === "link" ? page?.heroAspectRatio : item.aspectRatio,
    enrichment: s.enrichment,
  };
}

function classificationFor(s: Scenario): Classification {
  return {
    ...MODELS[s.model],
    ...(s.title === "blank" ? { title: "" } : {}),
    ...(s.cities === "omitted" ? { cities: undefined } : {}),
  };
}

export function gridArgs(
  s: Scenario,
  item: Doc<"items">,
  ids: GridIds,
): Settlement & { runId: string } {
  const keepTitle = s.lock === "refresh";
  const reading = readingFor(s, item, ids);
  if (MODES[s.mode].asked === "declined") {
    return { runId: RUN_ID, keepTitle, reading };
  }
  return {
    runId: RUN_ID,
    keepTitle,
    reading,
    classification: classificationFor(s),
  };
}

const TRACKED = [
  "title",
  "description",
  "tags",
  "content",
  "recipe",
  "siteName",
  "author",
  "heroImageUrl",
  "media",
  "articleMedia",
  "storageId",
  "aspectRatio",
  "intents",
  "cities",
  "status",
  "enrichment",
  "failureReason",
  "searchText",
] as const;

export function snapshotRow(
  item: Doc<"items">,
  ids: GridIds,
): Record<string, unknown> {
  const storage = new Map<string, string>([
    [ids.poster, "old poster"],
    [ids.newPoster, "new poster"],
    [ids.image, "image upload"],
  ]);
  const row: Record<string, unknown> = {};
  for (const key of TRACKED) {
    const value = item[key];
    if (value === undefined) {
      row[key] = null;
    } else if (key === "storageId") {
      row[key] = storage.get(value as string) ?? "other storage";
    } else {
      row[key] = value;
    }
  }
  return row;
}
