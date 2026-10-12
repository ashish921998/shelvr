import assert from "node:assert/strict";
import test from "node:test";
import { readStatements, region } from "./assemble-analytics-validation.mjs";

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
