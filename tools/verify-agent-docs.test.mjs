import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appRoutes,
  convexModules,
  schemaTables,
  undocumented,
} from "./verify-agent-docs.mjs";

const file = (name) => ({ name, isDirectory: () => false });
const dir = (name) => ({ name, isDirectory: () => true });

test("reads table names and skips nested defineTable-like fields", () => {
  const source = [
    "export default defineSchema({",
    "  ...authTables,",
    "  items: defineTable({",
    "    nested: v.object({ spaces: v.string() }),",
    "  }).index('by_user', ['userId']),",
    "  spaceItems: defineTable({}),",
    "});",
  ].join("\n");
  assert.deepEqual(schemaTables(source), ["items", "spaceItems"]);
});

test("keeps config modules and drops tests and non-TypeScript files", () => {
  assert.deepEqual(
    convexModules([
      "items.ts",
      "items.test.ts",
      "auth.config.ts",
      "test.setup.ts",
      "tsconfig.json",
      "model",
    ]),
    ["items.ts", "auth.config.ts", "test.setup.ts"],
  );
});

test("names routes the way the doc writes them", () => {
  const tree = {
    "(tabs)": [file("_layout.tsx"), dir("(home)"), dir("(search)")],
    item: [file("[id].tsx")],
    space: [file("_layout.tsx"), file("index.tsx")],
  };
  const routes = appRoutes(
    [
      file("_layout.tsx"),
      file("add.tsx"),
      file("notes.md"),
      dir("(tabs)"),
      dir("item"),
      dir("space"),
    ],
    (name) => tree[name],
  );
  assert.deepEqual(routes, ["add", "(home)", "(search)", "item/[id]", "space"]);
});

test("a name counts only when the doc writes it in backticks", () => {
  const doc =
    "Routes: `add`, `item/[id]`. See `convex/ai.ts`. The items table is here.";
  assert.deepEqual(
    undocumented(doc, ["add", "item/[id]", "ai.ts", "items", "import"]),
    ["import", "items"],
  );
});
