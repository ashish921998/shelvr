import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

test("workflows execute immutable action revisions and an exact EAS version", () => {
  for (const file of readdirSync(".github/workflows")) {
    const source = readFileSync(`.github/workflows/${file}`, "utf8");
    for (const [, action] of source.matchAll(/uses:\s*(\S+)/g)) {
      assert.match(
        action,
        /^(?:[\w.-]+\/[\w./-]+@[a-f0-9]{40}|\.\/\.secure-review-tooling\/(?:\.github\/actions\/secure-review|runtime\/(?:droid|claude)))$/,
        `${file}: ${action}`,
      );
    }
    assert.doesNotMatch(
      source,
      /plugin_marketplaces:/,
      `${file}: remote plugin source`,
    );
    if (source.includes("eas-version:"))
      assert.match(source, /eas-version: \d+\.\d+\.\d+\s/);
  }
});

test("review preparations pin every upstream checkout and run before secrets are supplied", () => {
  const wrapper = readFileSync(
    ".github/actions/secure-review/action.yml",
    "utf8",
  );
  assert.doesNotMatch(wrapper, /factory_api_key|oauth_token|secrets\./);
  const repositories = [...wrapper.matchAll(/repository: (\S+)\s+ref: (\S+)/g)];
  assert.equal(repositories.length, 3);
  for (const [, repository, ref] of repositories)
    assert.match(ref, /^[a-f0-9]{40}$/, repository);
  for (const name of [
    "droid",
    "droid-review",
    "claude",
    "claude-code-review",
  ]) {
    const source = readFileSync(`.github/workflows/${name}.yml`, "utf8");
    const preparation = source.indexOf("uses: ./.secure-review-tooling/.github/actions/secure-review");
    const runtime = source.indexOf("uses: ./.secure-review-tooling/runtime/");
    assert.match(source, /repository:.*github.repository.*
\s+ref: [a-f0-9]{40}
\s+path: \.secure-review-tooling/);
    assert.notEqual(preparation, -1);
    assert.notEqual(runtime, -1);
    assert.ok(preparation < runtime);
    assert.match(source, /fetch-depth: 1\s+persist-credentials: false/);
  }
});
