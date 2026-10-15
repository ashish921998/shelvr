import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { trailerValues } from "./git-trailer.mjs";

// Reading a trailer is git's job, so the test gives git real commits rather
// than a string that only looks like one.
const repo = realpathSync(mkdtempSync(join(tmpdir(), "git-trailer-")));
const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

git("init", "--quiet");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Test");
git("config", "commit.gpgsign", "false");

const commit = (message) =>
  git("commit", "--quiet", "--allow-empty", "-m", message);

commit("root");
const root = git("rev-parse", "HEAD").trim();

after(() => rmSync(repo, { recursive: true, force: true }));

test("a value containing a comma stays one value", () => {
  commit(
    "chore: widen a validator\n\nConvex-Api: changed, client migration pending",
  );
  const values = trailerValues(repo, `${root}..HEAD`, "Convex-Api");
  assert.deepEqual(values, ["changed, client migration pending"]);
});

test("two trailers on one commit are two values", () => {
  const from = git("rev-parse", "HEAD").trim();
  commit("chore: two\n\nConvex-Api: changed\nConvex-Api: reviewed");
  assert.deepEqual(trailerValues(repo, `${from}..HEAD`, "Convex-Api"), [
    "changed",
    "reviewed",
  ]);
});

test("commits without the trailer contribute nothing", () => {
  const from = git("rev-parse", "HEAD").trim();
  commit("chore: unrelated");
  commit("chore: also unrelated\n\nNative-Fingerprint: changed");
  assert.deepEqual(trailerValues(repo, `${from}..HEAD`, "Convex-Api"), []);
});
