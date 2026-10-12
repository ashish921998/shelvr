import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assemble, queryIds, readStatements, region } from "./assemble-analytics-validation.mjs";

test("assembles five read-only statements from shared transforms", () => {
  const statements = readStatements();
  assert.equal(statements.length, 5);
  for (const statement of statements) {
    assert.ok(statement.startsWith("WITH internal_accounts"));
    assert.doesNotMatch(statement, /FROM events/);
  }
  assert.equal(region(statements[1], "transform", "q2a"), region(statements[2], "transform", "q2b"));
});

test("rejects absent or ambiguous regions", () => {
  assert.throws(() => region("", "source", "q1"));
  const block = "-- source:begin q1\nx\n-- source:end q1\n";
  assert.throws(() => region(block + block, "source", "q1"));
});

test("preserves all 92 literal rows transcribed from the original tables", () => {
  // Independently compared cell-for-cell with cd8d9881 before removing tables.
  const hashes = [
    "9f0db8acef55aa751ce7aa9f22acde8b7af5f613bf8d45fbd270a007ea9902fa",
    "8f821ab350cc283848c3580b206719ecf5bd67de2b42d415b695c420e1749976",
    "a7c11432c134e4c6faa25e623992109c85933b2bd5f3e5754b1865f385759821",
    "6e22916175249818d4bc80a95a26d15ea9f00bbf54a40601a0d6b9faac702117",
    "29ff575786c99a9504435aa640b2eec56543d23c4fb743c214c8a886d7a17c89",
  ];
  const counts = [16, 19, 9, 24, 24];
  readStatements().forEach((statement, index) => {
    const expected = statement.match(/expected AS \(\n([\s\S]*?)\n\)/)[1];
    assert.equal(createHash("sha256").update(expected).digest("hex"), hashes[index]);
    assert.equal(expected.split("\n").length, counts[index]);
    assert.match(statement, /LEFT JOIN actual ON actual\.case_id = expected\.case_id/);
    assert.match(statement, /'__row_count__' AS case_id/);
    assert.ok(statement.includes(`(SELECT count() FROM actual) = ${counts[index]}`));
    assert.ok(statement.includes(`(SELECT uniqExact(case_id) FROM actual) = ${counts[index]}`));
  });
});

test("shares Query 2 and preserves reporting group and source boundaries", () => {
  const production = readFileSync(new URL("../docs/analytics/trial-baselines.sql", import.meta.url), "utf8");
  const validation = readFileSync(new URL("../docs/analytics/validate-trial-baselines.sql", import.meta.url), "utf8");
  const statements = assemble(production.replace("-- transform:begin q2a\n", "-- transform:begin q2a\n-- probe\n"), validation);
  assert.match(statements[1], /-- probe/);
  assert.match(statements[2], /-- probe/);
  assert.equal((production.match(/-- source:begin /g) ?? []).length, 4);
  assert.equal((production.match(/cohort AS \(SELECT toDateTime/g) ?? []).length, 4);
  assert.doesNotMatch(production, /is_internal = 0 AND|trial_windows AS|trial_pre_terminal AS/);
  assert.doesNotMatch(production, /\bx\.matched_attribution/);
  assert.match(production, /attribution\.matched_attribution/);
  for (const id of queryIds) {
    const tail = region(production, "final", id);
    assert.match(tail, /reported AS \(SELECT \* FROM .* WHERE is_internal = 0\)/);
    assert.match(tail, /LEFT JOIN reported_metrics/);
  }
  for (const file of [production, validation]) assert.ok(file.split("\n").length <= 1000);
});
