import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACKNOWLEDGEMENT,
  diffSignatures,
  formatReport,
  isAcknowledged,
  isBreaking,
  moduleName,
  signatures,
} from "./verify-convex-api.mjs";

const path = (name) => `apps/native/convex/${name}.ts`;
const tree = (modules) =>
  new Map(Object.entries(modules).map(([name, source]) => [path(name), source]));

const shared = `
import { v } from "convex/values";
export const itemValidator = v.object({ _id: v.id("items"), title: v.string() });
`;

const items = `
import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { itemValidator } from "./model/items";

export const listItems = query({
  args: {},
  returns: v.array(itemValidator),
  handler: async (ctx) => [],
});

export const deleteItem = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, args) => null,
});

export const reindex = internalQuery({
  args: { cursor: v.string() },
  returns: v.null(),
  handler: async () => null,
});
`;

const base = tree({ items, "model/items": shared });

test("a module path reads as the Convex API path", () => {
  assert.equal(moduleName(path("items")), "items");
  assert.equal(moduleName(path("model/items")), "model/items");
});

test("public functions are collected and internal ones are not", () => {
  const found = [...signatures(base).keys()].sort();
  assert.deepEqual(found, ["items:deleteItem", "items:listItems"]);
});

test("narrowing an argument validator is a change", () => {
  const head = tree({
    "model/items": shared,
    items: items.replace(
      'args: { itemId: v.id("items") }',
      'args: { itemId: v.id("items"), reason: v.string() }',
    ),
  });
  const diff = diffSignatures(signatures(base), signatures(head));
  assert.deepEqual(diff.changed, ["items:deleteItem"]);
  assert.equal(isBreaking(diff), true);
});

// The reason this tool exists. listItems' own text is untouched; the shape it
// promises moved in another file, and reading the diff would not say so.
test("a validator that moved in another file changes every caller's contract", () => {
  const head = tree({
    items,
    "model/items": shared.replace("title: v.string()", "title: v.optional(v.string())"),
  });
  const diff = diffSignatures(signatures(base), signatures(head));
  assert.deepEqual(diff.changed, ["items:listItems"]);
  assert.equal(isBreaking(diff), true);
});

test("a new function is additive and does not fail", () => {
  const head = tree({
    "model/items": shared,
    items: `${items}
export const pinItem = mutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async () => null,
});
`,
  });
  const diff = diffSignatures(signatures(base), signatures(head));
  assert.deepEqual(diff.added, ["items:pinItem"]);
  assert.deepEqual(diff.changed, []);
  assert.equal(isBreaking(diff), false);
});

test("a function an installed app could still call is a removal", () => {
  const head = tree({
    "model/items": shared,
    items: items.replace(/export const deleteItem[\s\S]*?\n\}\);\n/, ""),
  });
  const diff = diffSignatures(signatures(base), signatures(head));
  assert.deepEqual(diff.removed, ["items:deleteItem"]);
  assert.equal(isBreaking(diff), true);
});

test("reformatting and handler edits are not contract changes", () => {
  for (const source of [
    items.replace(/\n/g, "\n   "),
    items.replace("handler: async (ctx) => []", "handler: async (ctx) => {\n    return [];\n  }"),
  ]) {
    const diff = diffSignatures(
      signatures(base),
      signatures(tree({ items: source, "model/items": shared })),
    );
    assert.deepEqual(diff.changed, [], "no contract moved");
    assert.equal(isBreaking(diff), false);
  }
});

test("only the exact trailer value acknowledges", () => {
  assert.equal(isAcknowledged(["changed"]), true);
  assert.equal(isAcknowledged([" changed "]), true);
  assert.equal(isAcknowledged([]), false);
  assert.equal(isAcknowledged(["changed later"]), false);
});

test("the report names the function, the sequence and the trailer", () => {
  const diff = { added: [], removed: [], changed: ["items:deleteItem"] };
  const report = formatReport({
    baseRef: "origin/main",
    headRef: "HEAD",
    diff,
    acknowledged: false,
  });
  assert.match(report, /items:deleteItem/);
  assert.match(report, /Expand first, deploy, move/);
  assert.ok(report.includes(ACKNOWLEDGEMENT));
});

test("an acknowledged change reports as acknowledged and stops there", () => {
  const report = formatReport({
    baseRef: "origin/main",
    headRef: "HEAD",
    diff: { added: [], removed: [], changed: ["items:deleteItem"] },
    acknowledged: true,
  });
  assert.match(report, /Acknowledged by a Convex-Api: changed trailer/);
  assert.doesNotMatch(report, /Expand first/);
});

test("an unchanged tree says so", () => {
  const diff = diffSignatures(signatures(base), signatures(base));
  assert.equal(isBreaking(diff), false);
  assert.match(
    formatReport({ baseRef: "a", headRef: "b", diff, acknowledged: false }),
    /No public contract was narrowed/,
  );
});
