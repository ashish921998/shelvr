import assert from "node:assert/strict";
import { test } from "node:test";

import {
  appRoutes,
  convexModules,
  schemaTables,
  section,
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

test("names routes the way the doc writes them, at any depth", () => {
  const tree = {
    "": [
      file("_layout.tsx"),
      file("add.tsx"),
      file("notes.md"),
      dir("(tabs)"),
      dir("item"),
      dir("space"),
    ],
    "(tabs)": [
      file("_layout.tsx"),
      dir("(home)"),
      dir("(search)"),
      file("inbox.tsx"),
    ],
    item: [file("[id].tsx"), dir("[id]")],
    "item/[id]": [file("edit.tsx")],
    space: [file("_layout.tsx"), file("index.tsx")],
  };
  assert.deepEqual(
    appRoutes((relDir) => tree[relDir]),
    [
      "add",
      "(home)",
      "(search)",
      "inbox",
      "item/[id]",
      "item/[id]/edit",
      "space",
    ],
  );
});

test("a section ends at the next heading of its level or above", () => {
  const doc = [
    "# Doc",
    "### Backend (`convex/`)",
    "`items`",
    "#### Detail",
    "`spaces`",
    "### Native",
    "`import`",
    "## Env",
    "`other`",
  ].join("\n");
  assert.equal(
    section(doc, "### Backend"),
    " (`convex/`)\n`items`\n#### Detail\n`spaces`\n",
  );
  assert.equal(section(doc, "### Native"), "\n`import`\n");
  assert.equal(section(doc, "### Gone"), "");
});

test("a route named like a keyword is not excused by another section", () => {
  const doc = "\n### Backend\nuses `import` syntax\n### Native\n`add`\n";
  assert.deepEqual(
    undocumented(section(doc, "### Native"), ["add", "import"]),
    ["import"],
  );
});

test("a name counts only when the doc writes it in backticks", () => {
  const doc =
    "Routes: `add`, `item/[id]`. See `convex/ai.ts`. The items table is here.";
  assert.deepEqual(
    undocumented(doc, ["add", "item/[id]", "ai.ts", "items", "import"]),
    ["import", "items"],
  );
});
