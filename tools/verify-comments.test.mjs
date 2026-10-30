import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createRepo } from "./temp-repo.mjs";
import { addedComments, comments, isChecked } from "./verify-comments.mjs";

const texts = (path, source) => comments(path, source).map(({ text }) => text);

test("finds line, block, JSX and end-of-block comments", () => {
  const source = `// top
const a = 1; // trailing
function f() {
  return a;
  // before the brace
}
export const C = () => <div>{/* jsx */}https://example.com // text</div>;
`;
  assert.deepEqual(texts("a.tsx", source), [
    "// top",
    "// trailing",
    "// before the brace",
    "/* jsx */",
  ]);
});

test("reads JSX text as text when it starts like a comment", () => {
  const source = `export const A = () => <div>/* literal */</div>;
export const B = () => <a href="x">// see docs</a>;
export const C = (p) => <div>{p.x}// after expr</div>;
export const D = () => <div>/* one */ /* two */</div>;
export const E = () => <div>{/* real */}/* literal */</div>;
`;
  assert.deepEqual(texts("a.tsx", source), ["/* real */"]);
  assert.deepEqual(
    addedComments("a.tsx", "", "const C = () => <div>/* text */</div>;\n"),
    [],
  );
});

test("ignores pragmas and comment-like strings", () => {
  const source = `// @vitest-environment edge-runtime
// eslint-disable-next-line no-console
const url = "https://example.com // not a comment";
const re = /\\/\\//;
`;
  assert.deepEqual(texts("a.ts", source), []);
});

test("fails a file only when its comment count goes up", () => {
  const base = "// one\n// two\nexport {};\n";
  assert.deepEqual(addedComments("a.ts", base, "// shorter\nexport {};\n"), []);
  assert.deepEqual(
    addedComments("a.ts", base, "  // two\n// one\n// three\nexport {};\n").map(
      ({ text, line }) => [line, text],
    ),
    [[3, "// three"]],
  );
  assert.equal(addedComments("a.ts", null, "// new file\n").length, 1);
});

test("checks app and tool sources, not generated ones", () => {
  assert.equal(isChecked("apps/native/src/lib/a.ts"), true);
  assert.equal(isChecked("tools/verify-comments.mjs"), true);
  assert.equal(isChecked("apps/native/convex/_generated/api.d.ts"), false);
  assert.equal(isChecked("apps/native/src/locales/catalogs.ts"), false);
  assert.equal(isChecked("docs/a.ts"), false);
});

const checkScript = fileURLToPath(
  new URL("./verify-comments.mjs", import.meta.url),
);
const { dir: repo, git, commit, remove } = createRepo("verify-comments-");
after(() => remove());

const check = (head) =>
  spawnSync(process.execPath, [checkScript, "main", head], {
    cwd: repo,
    encoding: "utf8",
  });
const file = "apps/native/src/lib/a.ts";
commit("root", { [file]: "export const a = 1;\n" });
const branch = (name, message, source) => {
  git("checkout", "--quiet", "-b", name, "main");
  commit(message, { [file]: source });
  git("checkout", "--quiet", "main");
};
branch("plain", "feat: b", "export const a = 1;\nexport const b = 2;\n");
branch("commented", "feat: b", "// b is two\nexport const a = 1;\n");
branch(
  "kept",
  "feat: licence\n\nThe photo licence cannot live in code.\n\nComments: kept",
  "// Photos: Unsplash licence\nexport const a = 1;\n",
);
commit("main moves on", { "apps/native/src/lib/c.ts": "// on main\n" });

test("passes a branch that adds no comment", () => {
  const result = check("plain");
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("fails a branch that adds one and names the line", () => {
  const result = check("commented");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /apps\/native\/src\/lib\/a\.ts:1 {2}\/\/ b is two/);
  assert.match(result.stdout, /Comments: kept/);
});

test("passes one acknowledged by the trailer", () => {
  const result = check("kept");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Acknowledged/);
});
