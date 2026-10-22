import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createRepo } from "./temp-repo.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const victim = createRepo("temp-repo-victim-");
after(() => victim.remove());

// What a hook does to its children. The victim stands in for the real
// repository, so the failure this guards against hits a scratch directory.
test("GIT_DIR from a hook cannot redirect the temp repository", () => {
  const helper = new URL("./temp-repo.mjs", import.meta.url).href;
  const script = `
    import { createRepo } from ${JSON.stringify(helper)};
    const inner = createRepo("temp-repo-inner-");
    inner.commit("inside");
    console.log(inner.dir);
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_DIR: join(victim.dir, ".git") },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  rmSync(result.stdout.trim(), { recursive: true, force: true });

  assert.equal(victim.git("rev-list", "--all", "--count").trim(), "0");
  assert.equal(victim.git("config", "--get", "core.bare").trim(), "false");
});

test("tools tests get their repository from createRepo", () => {
  const spawnsGit =
    /\b(?:execFileSync|execFile|execSync|spawnSync|spawn)\(\s*["'`]git\b/;
  const offenders = readdirSync(here).filter(
    (name) =>
      name.endsWith(".test.mjs") &&
      spawnsGit.test(readFileSync(join(here, name), "utf8")),
  );
  assert.deepEqual(
    offenders,
    [],
    "These tests run git themselves. Use createRepo() from tools/temp-repo.mjs: it clears the GIT_* variables a hook exports, which otherwise point git at the real repository.",
  );
});
