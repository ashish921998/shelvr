# Agent instructions

## Start here

Read `CLAUDE.md` before changing code. It is the detailed source of truth for
the product model, architecture, environment variables, commands, and
conventions. Keep this file short and use it as the routing layer rather than
duplicating that reference.

Before editing native app code, consult the Expo SDK 58 documentation linked in
`CLAUDE.md`. Before editing `apps/native/convex/**`, read
`apps/native/convex/_generated/ai/guidelines.md` and use the Convex-specific
workflow described there.

## Repository map

- `apps/native` is the full product: Expo Router client plus Convex backend.
- `apps/web` is the marketing site and its server-backed waitlist routes.
- `apps/native/convex` is the backend source of truth.

### Where things live

Check here before searching. Paths that start with `src/` or `convex/` are
under `apps/native`. Paths that start with `apps/`, `docs/`, `tools/` or
`.github/` are relative to the repository root.

- **No `hooks/` or `features/` directory.** Hooks and feature logic sit flat in
  `src/lib` as kebab-case files. Standalone hooks are named `use-*.ts`; a hook
  that belongs to one feature is exported from that feature's module
  (`useTrialReminder` in `trial-reminder.ts`, `useHomeFeed` in `home-feed.tsx`),
  so search for the hook name, not the filename. Subfolders exist only for
  `src/lib/share`, `src/lib/splash` and `src/lib/tidy`.
- **Design tokens:** `src/unistyles.ts`. Motion: `src/lib/motion.ts`. Shared
  primitives: `src/components/ui` (`themed-text.tsx`, `button.tsx`,
  `app-tab-bar.tsx`). See `docs/architecture/design-system.md`.
- **Paywall and entitlement:** `src/lib/entitlement.ts` owns `useEntitlement`,
  `openPaywall`, `openExitOffer`, `usePaywallGuard` and `restorePurchases`.
  Around it: `exit-offer*.ts`, `trial-reminder.ts`, `paywall-funnel.ts`,
  `paywall-telemetry.ts`, `revenuecat-*.ts`, and `src/components/pro-gate.tsx`.
  The server side is `convex/subscriptions.ts`.
- **Home feed:** `src/lib/home-feed.tsx` (`HomeFeedProvider`, `useHomeFeed`);
  cards in `src/components/item-card.tsx` and `src/components/home`.
- **Item detail:** route `src/app/(app)/item/[id].tsx`, body
  `src/components/item-detail.tsx`.
- **Saving:** share flow in `src/lib/share` and `src/app/(app)/share.tsx`;
  images in `src/lib/use-save-image.ts` and `use-save-image-batch.ts`; pasted
  link lists in `src/lib/import-links.ts`.
- **Onboarding:** screen `src/app/(app)/onboarding.tsx`, steps in
  `src/components/onboarding`, state in `src/lib/onboarding.tsx`,
  `onboarding-steps.ts` and `pending-onboarding.ts`.
- **Copy:** `src/locales/en.json` is the source catalog; `t()` and
  `useAppLocale()` come from `src/lib/i18n.ts`. `src/locales/catalogs.ts`,
  `src/locales/message-types.ts` and
  `convex/model/notificationTranslations.json` are written by
  `pnpm localization:generate` (a root script). Do not edit them by hand.
- **Analytics:** `src/lib/analytics.ts` holds the typed client event map
  (`AnalyticsEventProperties`); server capture is `convex/analytics.ts`. Read
  those rather than grepping call sites.
- **Link reading:** `convex/model/pageRead.ts` (`readPage`, per-host readers) on
  top of `convex/model/safeFetch.ts` and `convex/model/externalUrl.ts`.
  `convex/ai.ts` only orchestrates the model call.
- **Large files:** `convex/items.ts` (about 2,800 lines), `convex/ai.ts` and
  `convex/model/pageRead.ts` (about 1,650 each). Search for the export name
  first and read that range, not the whole file.
- **Dev fixtures:** `convex/devFixtures.ts` seeds items, spaces and a Pro
  subscription for the anonymous dev user.
- **Tests:** co-located `*.test.ts(x)`; shared setup in `src/test.setup.ts` and
  `convex/test.setup.ts`. Never put a test file under `src/app`: Expo Router
  bundles that tree.
- **Design handoffs, marketing assets and store media** are not in this repo.
  They live in the separate `shelvr-notes` repo.
- **Running on a simulator:** `docs/architecture/local-qa.md` covers worktree
  setup, the dev client link, sign-in, fixtures, and forcing onboarding or the
  paywall.
- **Pull requests:** fill in `.github/pull_request_template.md`.

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
same steps, so the pre-commit hook and the remote gate cannot drift. Knip's
Convex entries are the top-level `convex/*.ts` modules and their co-located
tests; every other file under `convex/` is a project file whose exports are
reported as unused unless another module imports them. The Convex CLI registers
every file under `convex/` though, so a `query` / `mutation` / `action` /
`internal*` function stays live through the router with no importer at all.
Keep registered functions in top-level modules, and confirm a reported export
against `_generated/api.d.ts` before removing it. Advisories
with no compatible fix yet are baselined in `pnpm.auditConfig.ignoreGhsas` in
the root `package.json`; re-evaluate that list when bumping dependencies.
Use `pnpm run coverage` when iterating on test changes. Tests are co-located
under `apps/native/convex/**`, `apps/native/src/**`, and `apps/web/src/**`.
Convex tests use `newConvexTest()` from `convex/test.setup.ts`; web tests use
Vitest with Node by default and jsdom when browser APIs are needed.

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

- `deploy.yml` runs after CI completes on `main` and deploys Convex
  production, nothing else. No approval gate: CI, each acting job's freshness
  check, and the pull request's public-contract check hold the line. One-time
  setup is the `CONVEX_DEPLOY_KEY` repo secret. Client updates ship only from
  `release.yml`, which deploys the same commit's backend first.
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
  fingerprint (a native dependency added or removed, a native config change,
  or `version` in `app.json`) makes new updates invisible to binaries built
  from the old fingerprint: cut a fresh store build before resuming OTA
  publishes. The version is the easy one to miss — a bump must land on
  `main` before any OTA aimed at the build carrying it. The build number is
  not an input.
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
