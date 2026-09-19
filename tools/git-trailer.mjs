import { execFileSync } from "node:child_process";

/**
 * The values of every `key` trailer on a commit in `range`.
 *
 * Git decides what counts as a trailer, so the same line written in a subject
 * or in ordinary body prose is not one. A regex over the log would accept both
 * and let a commit that merely documents the escape hatch use it.
 *
 * Values are separated with NUL, which a commit message cannot contain. A
 * comma can: `Convex-Api: changed, client migration pending` is one value, and
 * splitting it on the comma would hand the caller a bare `changed` that the
 * author never wrote.
 */
export function trailerValues(dir, range, key) {
  const output = execFileSync(
    "git",
    [
      "-C",
      dir,
      "log",
      `--format=%(trailers:key=${key},valueonly,separator=%x00)%x00`,
      range,
    ],
    { encoding: "utf8" },
  );
  return output
    .split("\0")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}
