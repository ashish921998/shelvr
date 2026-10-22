import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createRepo } from "./temp-repo.mjs";

const HOOK = fileURLToPath(new URL("../.husky/pre-push", import.meta.url));

test("the pre-push hook gates a push that updates a branch and nothing else", (t) => {
  const remote = createRepo("pre-push-remote-");
  const work = createRepo("pre-push-work-");
  const scratch = mkdtempSync(join(tmpdir(), "pre-push-"));
  const bin = join(scratch, "bin");
  const hooks = join(scratch, "hooks");
  const log = join(scratch, "gate.log");

  // A `pnpm` ahead of the real one that records what the hook asks it to run.
  mkdirSync(bin);
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh\necho "$*" >> "${log}"\n`);
  chmodSync(join(bin, "pnpm"), 0o755);
  // Husky starts the hook with `sh -e`; so does this stand-in.
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-push"), `#!/bin/sh\nexec sh -e "${HOOK}"\n`);
  chmodSync(join(hooks, "pre-push"), 0o755);

  const path = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${path}`;
  t.after(() => {
    process.env.PATH = path;
    remote.remove();
    work.remove();
    rmSync(scratch, { recursive: true, force: true });
  });

  work.git("config", "core.hooksPath", hooks);
  work.git("remote", "add", "origin", remote.dir);
  work.commit("first");
  work.commit("second");
  work.git("tag", "v1");
  const tip = work.git("rev-parse", "HEAD").trim();

  const gateRuns = () =>
    existsSync(log)
      ? readFileSync(log, "utf8").split("\n").filter(Boolean)
      : [];
  const pushes = [
    ["a new branch", "main:feature", 1],
    ["the same branch again", "main:feature", 0],
    ["a branch given as a commit ID", `${tip}:refs/heads/by-id`, 1],
    ["a branch given as a commit expression", "HEAD~1:refs/heads/by-sum", 1],
    ["a branch delete", ":refs/heads/by-id", 0],
    ["a tag", "v1", 0],
    ["a commit ID sent to a tag", `${tip}:refs/tags/by-id`, 0],
  ];
  for (const [what, refspec, runs] of pushes) {
    const before = gateRuns().length;
    work.git("push", "--quiet", "origin", refspec);
    assert.equal(
      gateRuns().length - before,
      runs,
      `Pushing ${what} (${refspec}) should run the gate ${runs} time(s).`,
    );
  }
  assert.ok(gateRuns().every((command) => command === "run check:code"));
});
