# Agent instructions

## Start here

Read `CLAUDE.md` before changing code. It is the detailed source of truth for
the product model, architecture, environment variables, commands, and
conventions. Keep this file short and use it as the routing layer rather than
duplicating that reference.

Before editing native app code, consult the Expo SDK 57 documentation linked in
`CLAUDE.md`. Before editing `apps/native/convex/**`, read
`apps/native/convex/_generated/ai/guidelines.md` and use the Convex-specific
workflow described there.

## Repository map

- `apps/native` is the full product: Expo Router client plus Convex backend.
- `apps/web` is the marketing site and its server-backed waitlist routes.
- `apps/native/convex` is the backend source of truth.

## Execution loop

1. Inspect the relevant files and preserve existing user changes.
2. Make the smallest complete change that matches nearby patterns.
3. Add or update behavior-focused tests for changed entry points and regressions.
4. Run the narrowest relevant check, then run `pnpm run check` before finishing.
5. Report the files changed, checks run, warnings, and anything intentionally skipped.

The root check runs lint, typecheck, coverage thresholds, Knip, Syncpack, and
the dependency audit (`pnpm run audit`, blocks on high/critical). Advisories
with no compatible fix yet are baselined in `pnpm.auditConfig.ignoreGhsas` in
the root `package.json`; re-evaluate that list when bumping dependencies.
Use `pnpm run coverage` when iterating on test changes. Tests are co-located
under `apps/native/convex/**` and `apps/native/src/**`; Convex tests use
`newConvexTest()` from `convex/test.setup.ts`.

## Non-negotiable boundaries

- Derive the authenticated user from Convex context. Never accept a client-supplied
  `userId` in a public Convex function.
- Use indexes or search indexes for growing Convex tables. Keep every Convex
  function's `args` and `returns` validators accurate.
- Gate saves and Pro features with `requireProEntitlement`.
- AI passes may change only `suggested` memberships. User-owned `saved` and
  `dismissed` decisions stay intact.
- Keep secrets and user content out of source, logs, tests, and reports.
- Do not reintroduce the retired notes-app domain or edit generated Convex files
  unless the Convex workflow explicitly requires regeneration.
