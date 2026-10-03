# Dependency audit exceptions

CI runs `pnpm audit --audit-level high`. An advisory with no compatible fix yet
is baselined in `pnpm.auditConfig.ignoreGhsas` in the root `package.json`.
`package.json` can't carry comments, so each entry is explained here. Remove an
entry as soon as a fixed version reaches the tree, and re-check every entry
when bumping Expo, Next.js or the lint tooling.

| Advisory                                                                 | Package               | Added             | Re-check by |
| ------------------------------------------------------------------------ | --------------------- | ----------------- | ----------- |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` <= 1.4.0 | 2026-10-02 (#225) | 2026-11-01  |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` 3.0.3        | 2026-10-03 (#222) | 2026-11-01  |

## node-forge (GHSA-86w9-cpqp-85rv)

Reaches the tree through `@expo/cli` and `expo-updates` >
`@expo/code-signing-certificates`. Both are build-side and only verify
signatures created locally. The shipped app checks OTA signatures natively,
and no app, Convex or web code imports `node-forge`.

## braces (GHSA-vfj7-8cjw-p6xm)

High-severity stack exhaustion when `braces` expands a crafted pattern. There
is no patched release; 3.0.3 is the latest.

Exposure: `braces` comes in only through `micromatch`, used by
`@expo/metro-file-map` / `metro-file-map` (Metro's file watcher), `fast-glob`
(under `knip` and `@next/eslint-plugin-next`) and `eslint-plugin-check-file`.
Every one of these is dev or build tooling that expands glob patterns written
in this repo's own config. No app, Convex or web code imports `micromatch` or
`braces`, Metro does not bundle them into the app, and no user input reaches a
glob. The realistic worst case is a crashed local build or lint run from a
malicious pattern someone would have to commit to this repo.
