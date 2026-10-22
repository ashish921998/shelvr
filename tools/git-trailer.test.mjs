import assert from "node:assert/strict";
import { after, test } from "node:test";

import { trailerValues } from "./git-trailer.mjs";
import { createRepo } from "./temp-repo.mjs";

// Reading a trailer is git's job, so the test gives git real commits rather
// than a string that only looks like one.
const { dir: repo, git, commit, remove } = createRepo("git-trailer-");

commit("root");
const root = git("rev-parse", "HEAD").trim();

after(() => remove());

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
