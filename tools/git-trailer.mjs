import { execFileSync } from "node:child_process";

/**
 * The values of every `key` trailer on a commit in `range`.
 *
 * Git decides what counts as a trailer, so the same line written in a subject
 * or in ordinary body prose is not one. A regex over the log would accept both
 * and let a commit that merely documents the escape hatch use it.
 */
export function trailerValues(dir, range, key) {
  const output = execFileSync(
    "git",
    [
      "-C",
      dir,
      "log",
      `--format=%(trailers:key=${key},valueonly,separator=%x2C)`,
      range,
    ],
    { encoding: "utf8" },
  );
  return output.split(/[\n,]/).filter((value) => value.trim() !== "");
}
