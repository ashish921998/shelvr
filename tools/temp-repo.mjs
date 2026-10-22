import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * A throwaway repository for a test.
 *
 * Git exports GIT_DIR and its siblings to every hook, and they outrank
 * `git -C`. A test run from a hook would then init, configure and commit in the
 * real repository: one such run left core.bare=true and a fake identity in the
 * config every worktree shares. They are cleared from this process, not just
 * from the helper's own calls, because the code under test runs git with the
 * ambient environment too.
 */
export function createRepo(prefix) {
  const hookVariables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  });
  for (const name of hookVariables.split("\n")) {
    if (name) delete process.env[name];
  }

  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");

  const commit = (message, files = {}) => {
    for (const [file, source] of Object.entries(files)) {
      mkdirSync(join(dir, dirname(file)), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    git("add", "--all");
    git("commit", "--quiet", "--allow-empty", "-m", message);
  };

  return {
    dir,
    git,
    commit,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
