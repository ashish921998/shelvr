import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether `moduleUrl` is the file node was asked to run, as opposed to one an
 * import pulled in.
 *
 * The usual idiom compares `import.meta.url` against
 * `pathToFileURL(process.argv[1])` as strings. Those name the same file by
 * different paths whenever anything on the way is a symlink, because
 * `import.meta.url` is already resolved to the real path and `argv[1]` is
 * whatever was typed: on macOS every path under `/tmp` is really under
 * `/private/tmp`, and a CI worker may check a project out through a link. The
 * comparison then quietly concludes "imported", `main` never runs, and the
 * script exits 0 having done nothing. For a gate whose job is to refuse, that
 * is the worst available failure, so compare what the two paths point at, and
 * throw rather than answer when the filesystem cannot say.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  // node was given no file to run at all (--eval, stdin, the REPL), so no
  // module is the program. An EACCES or ELOOP on a path that does exist is a
  // different thing, and swallowing it would exit 0 without running the check
  // it was asked for, so it propagates.
  if (typeof entry !== "string" || entry === "") return false;
  return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
}
