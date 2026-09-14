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

## Naming conventions

ESLint enforces file and identifier naming (`eslint-plugin-check-file` and
`@typescript-eslint/naming-convention`; generated Convex files are exempt).

- `apps/native/convex/**` modules and their co-located tests are
  lowerCamelCase.
- `apps/native/src/**` files are kebab-case.
- `apps/web/src/components/**` are PascalCase, `src/lib` modules are
  lowerCamelCase, and `src/app` keeps the fixed Next.js route filenames.
- Variables, functions, and parameters are camelCase, constants may be
  UPPER_CASE, and types, classes, interfaces, and enums are PascalCase.
  Leading underscores are allowed.

## Complexity limits

ESLint fails on functions over cyclomatic complexity 30, 50 statements,
block depth 4, or 4 nested callbacks. Extract helpers, hooks, or
subcomponents instead of disabling the rules. `max-lines-per-function` is
intentionally unset: long JSX render trees and long tests are common here and
carry less risk than branchy logic. Both apps lint with
`eslint . --max-warnings 0`, so a warning fails the gate the same as an
error; fix it or justify a targeted disable comment. The native app does not
use `expo lint`, which silently skips the `convex/` backend.

## Execution loop

1. Inspect the relevant files and preserve existing user changes.
2. Make the smallest complete change that matches nearby patterns.
3. Add or update behavior-focused tests for changed entry points and regressions.
4. Run the narrowest relevant check, then run `pnpm run check` before finishing.
5. Report the files changed, checks run, warnings, and anything intentionally skipped.

The root check runs lint, typecheck, coverage thresholds, Knip, Syncpack, and
the dependency audit (`pnpm run audit`, blocks on high/critical). CI runs the
same steps, so the pre-commit hook and the remote gate cannot drift. Advisories
with no compatible fix yet are baselined in `pnpm.auditConfig.ignoreGhsas` in
the root `package.json`; re-evaluate that list when bumping dependencies.
Use `pnpm run coverage` when iterating on test changes. Tests are co-located
under `apps/native/convex/**` and `apps/native/src/**`; Convex tests use
`newConvexTest()` from `convex/test.setup.ts`.

## Observability

- Native app: report handled failures with `analytics.captureError(event, error)`
  (stable snake_case event, sanitized message). Crashes are covered by the root
  `ErrorBoundary` in `src/app/_layout.tsx` plus PostHog exception autocapture,
  which the PostHog project setting must also enable server-side.
- Convex backend: `logEvent(level, event, fields)` from `convex/model/log.ts`
  emits one JSON line per event into the Convex log stream. Fields are scalars
  only (categories, codes, ids, counts) — never messages, URLs, or user content.
- Web: server code uses `serverLog` from `apps/web/src/lib/serverLog.ts`; client
  render failures report via `captureWebException` from `app/error.tsx` and
  `app/global-error.tsx`.
- `GET /health` on the Convex site URL answers 200/503 for uptime monitors.
- ESLint `no-console` blocks ad-hoc logging outside those logger modules and
  tests; `console.warn` stays allowed in native `src/`.

## Deployment

- `deploy.yml` runs after CI completes on `main`: the `production`-environment
  job deploys Convex behind a required-reviewer approval, then an EAS Update
  goes to the `internal-test` channel. One-time setup, in this order: add a
  required reviewer to the GitHub `production` environment first (the
  reviewer queues each backend deploy until they approve it), then add
  the `CONVEX_DEPLOY_KEY` and `EXPO_TOKEN` repo secrets.
- `release.yml` is dispatched manually for EAS store builds (`--auto-submit`
  requires store credentials on EAS servers) or production-channel OTA.
  Both manual workflows require successful main push CI for the selected
  commit. Release deploys that commit's backend before the client and shares
  Deploy's concurrency group; it also requires `CONVEX_DEPLOY_KEY`.
  Non-main dispatches fail explicitly. iOS submissions verify the EAS key
  assignment for the production bundle and Apple team before queueing builds.
- OTA uses EAS production's plaintext/sensitive variables, never Secret
  values. Both workflows validate readable production Convex URLs and both
  RevenueCat public SDK keys before publishing. Set them with `eas env:set`
  (`--name`, `--value`, `--environment production`, `--visibility sensitive`).
  The verifier also requires readable `GOOGLE_MAPS_API_KEY`,
  `POSTHOG_PROJECT_TOKEN`, and `POSTHOG_HOST` to keep fingerprint inputs
  consistent. Validation and publication both pin `APP_VARIANT=production`.
- OTA updates reach installs by EAS fingerprint. Any change that alters the
  fingerprint (a native dependency added or removed, a native config change)
  makes new updates invisible to binaries built from the old fingerprint:
  cut a fresh store build before resuming OTA publishes.
- Web deploys via the Vercel Git integration on `main`; no workflow needed.
- Backend-first ordering: deploy compatible Convex changes before the client
  that needs them. Breaking changes go out as expand/contract — an installed
  client must never reach a missing function or a stricter validator.

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
