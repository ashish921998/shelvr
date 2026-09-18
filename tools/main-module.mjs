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
 * is the worst available failure, so compare what the two paths point at.
 */
export function isMainModule(moduleUrl) {
  try {
    return (
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl))
    );
  } catch {
    // argv[1] is absent or unreadable, so nothing asked for this file by path.
    return false;
  }
}
