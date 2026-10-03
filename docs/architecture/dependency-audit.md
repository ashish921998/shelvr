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
