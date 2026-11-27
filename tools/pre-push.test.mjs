import assert from "node:assert/strict";
import {
  chmodSync,
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

test("pre-push checks branch diffs using Git alone", (t) => {
  const remote = createRepo("pre-push-remote-");
  const work = createRepo("pre-push-work-");
  const scratch = mkdtempSync(join(tmpdir(), "pre-push-"));
  const bin = join(scratch, "bin");
  const hooks = join(scratch, "hooks");
  mkdirSync(bin);
  for (const executable of ["pnpm", "node"]) {
    writeFileSync(join(bin, executable), "#!/bin/sh\nexit 97\n");
    chmodSync(join(bin, executable), 0o755);
  }
  // Husky starts the hook with `sh -e`; so does this stand-in.
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-push"), `#!/bin/sh\nexec sh -e "${HOOK}" "$@"\n`);
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
  work.commit("first", { "example.txt": "clean\n" });
  work.commit("second");
  work.git("tag", "v1");
  const tip = work.git("rev-parse", "HEAD").trim();

  const pushes = [
    "main:feature",
    "main:feature",
    `${tip}:refs/heads/by-id`,
    "HEAD~1:refs/heads/by-sum",
    "v1",
    `${tip}:refs/tags/by-id`,
  ];
  for (const refspec of pushes) {
    work.git("push", "--quiet", "origin", refspec);
  }

  work.git("update-ref", "refs/remotes/origin/main", tip);
  work.commit("invalid whitespace", { "example.txt": "clean\ntrailing \n" });
  for (const refspec of ["main:feature", "HEAD:refs/heads/invalid"]) {
    assert.throws(
      () => work.git("push", "--quiet", "origin", refspec),
      /trailing whitespace/,
    );
  }
  assert.equal(remote.git("rev-parse", "refs/heads/feature").trim(), tip);

  work.git("tag", "unchecked-tag");
  work.git("push", "--quiet", "origin", "unchecked-tag", ":refs/heads/by-id");

  const upstream = work.git("rev-parse", "HEAD").trim();
  work.git("update-ref", "refs/remotes/origin/main", upstream);
  work.commit("clean change above upstream", { "new.txt": "clean\n" });
  work.git("push", "--quiet", "origin", "HEAD:refs/heads/above-main");
  work.git("remote", "add", "backup", remote.dir);
  work.git("push", "--quiet", "backup", "HEAD:refs/heads/backup-feature");

  const attributes = readFileSync(new URL("../.gitattributes", import.meta.url), "utf8");
  work.commit("generated patch and verbatim font license", {
    ".gitattributes": attributes,
    "patches/example.patch": "--- a/example.txt\n+++ b/example.txt\n@@ -1,2 +1,2 @@\n \n-old\n+new\n",
    "apps/web/public/fonts/CrimsonPro-OFL.txt": "Keep the distributed license as written. \n",
  });
  const generated = work.git("rev-parse", "HEAD").trim();
  work.git("checkout", "--quiet", "--detach", upstream);
  work.git("push", "--quiet", "origin", `${generated}:refs/heads/generated`);

  remote.commit("a remote-only change", { "remote.txt": "remote\n" });
  remote.git("update-ref", "refs/heads/missing-tip", "HEAD");
  work.git("push", "--quiet", "--force", "origin", `${generated}:refs/heads/missing-tip`);
  assert.equal(remote.git("rev-parse", "refs/heads/missing-tip").trim(), generated);

  work.git("checkout", "--quiet", "--detach", generated);
  work.commit("an actual conflict in a patch", {
    "patches/example.patch": "<<<<<<< HEAD\npatch\n=======\nother patch\n>>>>>>> branch\n",
  });
  assert.throws(
    () => work.git("push", "--quiet", "origin", "HEAD:refs/heads/conflict"),
    /leftover conflict marker/,
  );

  work.git("checkout", "--quiet", "--detach", tip);
  work.commit("old feature before rebase", { "rebased.txt": "old branch\n" });
  work.git("push", "--quiet", "origin", "HEAD:refs/heads/rebased");
  work.git("checkout", "--quiet", "--detach", upstream);
  work.commit("clean feature after rebase", { "rebased.txt": "rebased branch\n" });
  work.git("push", "--quiet", "--force", "origin", "HEAD:refs/heads/rebased");
  const rebased = work.git("rev-parse", "HEAD").trim();

  work.git("checkout", "--quiet", "--detach", upstream);
  work.commit("bad feature after rebase", { "rebased.txt": "new whitespace \n" });
  assert.throws(
    () => work.git("push", "--quiet", "--force", "origin", "HEAD:refs/heads/rebased"),
    /rebased.txt:1: trailing whitespace/,
  );
  assert.equal(remote.git("rev-parse", "refs/heads/rebased").trim(), rebased);
});
