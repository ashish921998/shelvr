import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const NODE_SCRIPT =
  /\bnode\s+(?:-\S+\s+)*["']?(?:(?:\.{1,2}|\$\{?\w+\}?)\/)*tools\/([\w./-]+\.[cm]?js)\b/g;

const scriptsRunByNode = (source) =>
  [...source.replaceAll("\\\n", " ").matchAll(NODE_SCRIPT)].map(
    ([, name]) => `tools/${name}`,
  );

test("finds the tools scripts a step runs with node", () => {
  assert.deepEqual(
    scriptsRunByNode(`
      run: node tools/direct.mjs "origin/$BASE_REF" HEAD
      run: node ../../tools/relative.mjs "$ota_env"
        "node ../../tools/folded.mjs
      run: node "$GITHUB_ACTION_PATH/../../../tools/action.mjs" "$REVIEW_PROVIDER"
      run: node tools/review-eval/nested.mjs
      run: node \\
        tools/continued.mjs --warn-only
      url=$(node --input-type=module -e '
      ' "$GITHUB_WORKSPACE/tools/e2e/tests/launch.ts")
      uses: actions/setup-node@3d3c42e5aac5ba805825da76410c181273ba90b1
    `),
    [
      "tools/direct.mjs",
      "tools/relative.mjs",
      "tools/folded.mjs",
      "tools/action.mjs",
      "tools/review-eval/nested.mjs",
      "tools/continued.mjs",
    ],
  );
});

test("knip.json lists every tools script a workflow runs with node", () => {
  const entries = JSON.parse(readFileSync("knip.json", "utf8")).workspaces["."]
    .entry;
  const missing = [
    ...readdirSync(".github/workflows").map((name) => `workflows/${name}`),
    ...readdirSync(".github/actions", { recursive: true }).map(
      (name) => `actions/${name}`,
    ),
  ]
    .filter((path) =>
      /^(?:workflows\/[^/]+|actions\/(?:.+\/)?action)\.ya?ml$/.test(path),
    )
    .flatMap((path) =>
      scriptsRunByNode(readFileSync(`.github/${path}`, "utf8"))
        .filter((script) => !entries.includes(script))
        .map((script) => `  ${script} (run by .github/${path})`),
    );
  assert.deepEqual(
    missing,
    [],
    [
      `Add each script to the "." workspace's entry list in knip.json:`,
      ...missing,
      "Knip matches .gitignore against the absolute paths it finds in workflows, so in a checkout under an ignored folder (.claude/worktrees, /private/tmp) it drops them and reports the script, or its exports, as unused.",
    ].join("\n"),
  );
});
