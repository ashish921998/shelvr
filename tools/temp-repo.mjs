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

// Hooks export GIT_DIR and its siblings, which outrank `git -C`: cleared from
// process.env so neither this helper nor the code under test reaches the real repo.
export function createRepo(prefix) {
  const hookVariables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
    encoding: "utf8",
  });
  for (const name of hookVariables.split("\n")) {
    if (name) delete process.env[name];
  }

  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const remove = () => rmSync(dir, { recursive: true, force: true });
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  try {
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
  } catch (error) {
    remove();
    throw error;
  }

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
    remove,
  };
}
