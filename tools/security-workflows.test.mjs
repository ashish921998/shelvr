import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

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
    const preparation = source.indexOf(
      "uses: ./.secure-review-tooling/.github/actions/secure-review",
    );
    const runtime = source.indexOf("uses: ./.secure-review-tooling/runtime/");
    assert.match(
      source,
      /repository:.*github\.repository.*\s+ref: [a-f0-9]{40}\s+path: \.secure-review-tooling/,
    );
    assert.notEqual(preparation, -1);
    assert.notEqual(runtime, -1);
    assert.ok(preparation < runtime);
    assert.match(source, /fetch-depth: 1\s+persist-credentials: false/);
  }
});

test("tag-triggered paid agents require an authorized author before job execution", () => {
  for (const name of ["claude", "droid"]) {
    const source = readFileSync(`.github/workflows/${name}.yml`, "utf8");
    assert.match(source, /github\.actor == github\.repository_owner/);
    assert.match(source, /OWNER.*MEMBER.*COLLABORATOR/);
    assert.match(source, /author_association/);
  }
});

for (const name of ["claude", "droid"]) {
  test(`${name} rejects fork PRs before the secret-bearing job runs`, async () => {
    const source = readFileSync(`.github/workflows/${name}.yml`, "utf8");
    assert.match(
      source,
      new RegExp(
        `${name}:\\s+needs: authorize\\s+if: \\|\\s+needs\\.authorize\\.outputs\\.allowed == 'true' &&`,
      ),
    );
    const authorization = source.split(`\n  ${name}:`)[0];
    assert.doesNotMatch(authorization, /secrets\.|checkout@|write/);
    const script = authorization.match(/script: \|\n([\s\S]+)$/)?.[1];
    assert.ok(script);

    const events = [
      { eventName: "pull_request", payload: { pull_request: { number: 42 } } },
      {
        eventName: "pull_request_review",
        payload: { pull_request: { number: 42 } },
      },
      {
        eventName: "pull_request_review_comment",
        payload: { pull_request: { number: 42 } },
      },
      {
        eventName: "issue_comment",
        payload: { issue: { number: 42, pull_request: {} } },
      },
    ];
    for (const event of events) {
      for (const origin of ["ashish921998/shelvr", "outsider/shelvr", null]) {
        const outputs = [];
        const requests = [];
        await runInNewContext(`(async () => { ${script} })()`, {
          context: {
            ...event,
            repo: { owner: "ashish921998", repo: "shelvr" },
          },
          github: {
            rest: {
              pulls: {
                get: async (request) => {
                  requests.push(request);
                  return {
                    data: {
                      head: { repo: origin ? { full_name: origin } : null },
                    },
                  };
                },
              },
            },
          },
          core: { setOutput: (...output) => outputs.push(output) },
        });
        assert.deepEqual(outputs, [
          ["allowed", String(origin === "ashish921998/shelvr")],
        ]);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].pull_number, 42);
        assert.equal(requests[0].owner, "ashish921998");
        assert.equal(requests[0].repo, "shelvr");
      }
    }

    for (const event of [
      { eventName: "issues", payload: { issue: { number: 42 } } },
      { eventName: "issue_comment", payload: { issue: { number: 42 } } },
      { eventName: "pull_request_review_comment", payload: {} },
    ]) {
      const outputs = [];
      await runInNewContext(`(async () => { ${script} })()`, {
        context: event,
        github: {},
        core: { setOutput: (...output) => outputs.push(output) },
      });
      assert.deepEqual(outputs, [
        ["allowed", String(event.eventName !== "pull_request_review_comment")],
      ]);
    }

    const outputs = [];
    await assert.rejects(
      runInNewContext(`(async () => { ${script} })()`, {
        context: {
          ...events[0],
          repo: { owner: "ashish921998", repo: "shelvr" },
        },
        github: {
          rest: {
            pulls: {
              get: async () => {
                throw new Error("Unavailable");
              },
            },
          },
        },
        core: { setOutput: (...output) => outputs.push(output) },
      }),
      /Unavailable/,
    );
    assert.deepEqual(outputs, []);
  });
}
