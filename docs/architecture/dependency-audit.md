# Dependency audit baseline

`pnpm run audit` blocks on unbaselined high and critical advisories. The baseline
in `package.json` is an exception list, not evidence that those packages are
patched. Recheck each entry when updating dependencies.

As of 2026-10-03, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no patched release. The reviewed `braces@3.0.3` chains belong to build/check tooling, including
Knip, Expo/Metro, Next ESLint, and check-file. These tools consume
repository-controlled glob patterns during local checks and builds; product
request handlers do not expose this parser to users. The advisory is baselined under the
repository's policy for dependencies with no compatible fix. Remove the exception
when a fixed version is available or if this dependency becomes reachable from
untrusted runtime inputs.

As of 2026-10-25, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
is fixed in Zod 4.6.6. The application and Zod 4 tooling are pinned to patched
4.6.7 through a version-scoped override. Expo CLI 58.1.11 still requires Zod
3.25.76, for which the advisory lists no compatible patched release. That remaining
copy belongs to development/build tooling, not the app's content-processing
validators. The advisory is baselined only for that remaining Zod 3 dependency;
this does not mean Zod 3 is patched. Remove the exception when Expo CLI moves to
a patched version, and re-evaluate it if Zod 3 is introduced into runtime handlers.
