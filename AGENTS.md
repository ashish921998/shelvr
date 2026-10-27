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
  `src/lib/share` and `src/lib/splash`.
- **Design tokens:** `src/unistyles.ts`. Motion: `src/lib/motion.ts`. Shared
  primitives: `src/components/ui` (`themed-text.tsx`, `button.tsx`). See `docs/architecture/design-system.md`.
- **Paywall and entitlement:** `src/lib/entitlement.ts` owns `useEntitlement`,
  `openPaywall`, `openPaywallOutcome`, `usePaywallGuard` and `restorePurchases`.
  Around it: `trial-reminder.ts`, `paywall-funnel.ts`,
  `paywall-telemetry.ts` and `revenuecat-*.ts`.
  The server side is `convex/subscriptions.ts`.
- **Home:** `src/lib/home-feed.tsx` (`HomeFeedProvider`, `useHomeFeed`); the
  cities list and processing section are in `src/components/home`
  (`home-places.tsx`); failed and placeless saves are in `review-saves.tsx` and
  `unplaced-toast.tsx`. The city page is `src/app/(app)/city/[name].tsx`, with its
  map in `src/components/city` and Plan a date / Plan a trip in `src/lib/city-plan.ts`.
  Retired routes redirect to Home through `src/lib/home-href.ts`.
- **Map tab:** route `src/app/(app)/(tabs)/(map)/index.tsx`, map, search and filter chips in
  `src/components/map`, filter rules in `src/lib/map-filters.ts` and
  `convex/model/placeKinds.ts`, data from `convex/mapPlaces.ts`.
- **Item detail:** route `src/app/(app)/item/[id].tsx`, body
  `src/components/item-detail.tsx`.
- **Saving:** share flow in `src/lib/share` and `src/app/(app)/share.tsx`;
  the Add sheet (`src/app/(app)/add.tsx`) takes a pasted link only.
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
- **Link reading:** `convex/model/pageRead.ts` (`readPage`, host dispatcher),
  shared extraction and recipe helpers in `convex/model/pageReadCore.ts`, and
  per-host readers in `convex/model/readers/` (Google Maps lists split by city in
  `convex/model/placeList.ts`), on top of
  `convex/model/safeFetch.ts` and `convex/model/externalUrl.ts`.
  `convex/ai.ts` only orchestrates the model call.
- **Domain language:** `GLOSSARY.md` at the repo root defines the terms to use in
  copy and docs (save, reading, classification, settlement). Tables and
  functions keep `items` and `finalizeItem`.
- **Finished-save rules:** `convex/model/settlement.ts` (`completionPatch`)
  decides what a processing run writes to a save; `finalizeItem` in
  `convex/items.ts` is its adapter. `convex/finalizeItem.grid.test.ts` pins the
  rules with the recorded rows in `convex/testdata/settlement/rows.json`.
  `failurePatch` in the same module is the rule for a failed run;
  `convex/failItem.test.ts` tests it through `failItem` and the stale cron.
  Re-record only for a change you intend, with the command in the test header,
  and review the row diff.
- **Large files:** `convex/items.ts` (about 2,500 lines), `convex/ai.ts` (about 1,400)
  and `convex/model/pageReadCore.ts` (about 500). Embedding and recommendation actions
  live in `convex/aiEmbeddingSweep.ts` and `convex/aiRecommendForSpace.ts`.
  Search for the export name first and read that range, not the whole file.
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
- **Proving a change on the simulator:** `.agents/skills/verify-shelvr`
  drives the `tools/e2e` suite and maps the core features it covers to their tests.
- **Proving account deletion:** `.agents/skills/account-deletion` runs
  `convex/accountDeletion.test.ts` and says how to read a failure. Use it before
  changing the deletion drain in `convex/users.ts`, a table with a user key, an
  owner check, or a function that writes rows for a user.
- **Proving photo saves keep their image:** `.agents/skills/image-import-storage`
  model-checks the image import and upload receiver in TLA+
  (`tools/formal/image-import`). Use it before changing those functions, the
  storage cleanup crons, or any code that deletes a `_storage` blob.
- **Pull requests:** fill in `.github/pull_request_template.md`.
- **Reviewing a pull request:** read `REVIEW.md` first. It is the checklist
  every reviewer (CI Claude, Codex, any agent) works from.
- **Measuring a reviewer:** `tools/review-eval` holds past PRs that shipped a
  bug, plus clean ones, to score catch rate and false alarms.

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

`pnpm run check` is `check:code` (lint, typecheck, codegen and agent-docs drift,
tooling tests, coverage thresholds, Knip, Syncpack) followed by the dependency
audit (`pnpm run audit`, blocks on high/critical). CI and the pre-push hook
both run `check:code`, the hook before a push leaves the machine. The app-level
`check` scripts stop at lint, typecheck and tests, so run the root one; they stay
that way because a script change in `apps/native/package.json` moves the native
fingerprint. The audit is left out of both: CI
audits a pull request only when it changes a `package.json`, the lockfile or
`pnpm-workspace.yaml`, and `audit.yml` runs it daily, where a failed run is the
alert for a new advisory. Knip's
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
  only (categories, codes, ids, counts), never messages, URLs, or user content.
- Web: server code uses `serverLog` from `apps/web/src/lib/serverLog.ts`; client
  render failures report via `captureWebException` from `app/error.tsx` and
  `app/global-error.tsx`.
- `GET /health` on the Convex site URL answers 200/503 for uptime monitors.
- ESLint `no-console` blocks ad-hoc logging outside those logger modules and
  tests; `console.warn` stays allowed in native `src/`.

## Deployment

- `main` requires pull requests and up-to-date `check` and `convex api contract`
  checks, including for admins; no approving review is required. The production
  environment permits only `main` and has no human approval gate.
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
- OTA updates reach installs by EAS fingerprint. A change to a native module, a
  config plugin, `app.json` or `app.config.js` may move the fingerprint, and a
  moved fingerprint makes new updates invisible to binaries built from the old
  one: cut a fresh store build before resuming OTA publishes. Do not predict a
  move; run `pnpm run verify:fingerprint origin/main HEAD`. What the
  fingerprint hashes, and what it cannot see, is in
  `docs/architecture/push-notifications.md#what-the-fingerprint-hashes`.
- Web deploys via the Vercel Git integration on `main`; no workflow needed.
- Backend-first ordering: deploy compatible Convex changes before the client
  that needs them. Breaking changes go out as expand/contract, so an installed
  client must never reach a missing function or a stricter validator.

## Non-negotiable boundaries

- Derive the authenticated user from Convex context. Never accept a client-supplied
  `userId` in a public Convex function.
- Use indexes or search indexes for growing Convex tables. Keep every Convex
  function's `args` and `returns` validators accurate.
- Gate saves and Pro features with `requireProEntitlement`.
- AI passes may change only `suggested` memberships, except that the classifier
  inserts new matches as `saved` into a space the user set to auto-file.
  User-owned `saved` and `dismissed` decisions stay intact.
- Keep secrets and user content out of source, logs, tests, and reports.
- Do not reintroduce the retired notes-app domain or edit generated Convex files
  unless the Convex workflow explicitly requires regeneration.

## Rules and what enforces them

The rules here and in `CLAUDE.md`, and what fails when one is broken. When you
are corrected for a rule already listed, fix the mistake and move the rule up
in the same change: remove the way to get it wrong, then types, then a lint or
CI check whose message names the fix, then a test. Docs come last. A row that
fails "nowhere" is a repeat waiting to happen. Drop a row once its mistake
cannot happen.

| Rule                                                                               | Enforced by                                                                                                      | Fails in                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| File and identifier naming                                                         | ESLint `check-file`, `naming-convention`                                                                         | `lint`                               |
| Complexity limits, zero lint warnings                                              | ESLint `complexity`, `max-*`, `--max-warnings 0`                                                                 | `lint`                               |
| No `console.*` in app code outside the loggers                                     | ESLint `no-console` (native `src/` allows `warn`)                                                                | `lint`                               |
| `check:code` is the one gate                                                       | Wiring only: `.husky/pre-push` and the CI `Gate` step call it                                                    | nowhere if they stop                 |
| The pre-push hook gates a push of branch commits, not deletes or tags              | `tools/pre-push.test.mjs` pushes through the real hook                                                           | `check:code`                         |
| Convex modules the app imports pull in no server-only package (zod, ai, linkedom)  | `src/lib/client-bundle-imports.test.ts` walks their imports                                                      | `check:code`                         |
| `_generated/api.d.ts` lists every Convex module                                    | `tools/verify-convex-codegen.mjs`                                                                                | `check:code`                         |
| Copy lives in `en.json`; generated catalogs untouched                              | `localization-source.test.ts`, `localization-catalogs.test.ts`                                                   | `check:code`                         |
| `CLAUDE.md` names every table, module and route                                    | `tools/verify-agent-docs.mjs`                                                                                    | `check:code`                         |
| No dead code; one version per dependency                                           | Knip, Syncpack                                                                                                   | `check:code`                         |
| `tools/*.test.mjs` that run git use `createRepo()`                                 | `tools/temp-repo.test.mjs`                                                                                       | `check:code`                         |
| App Review notes quote only text in `en.json`, the App Intents or the paywall list | `tools/onboarding-sync.test.mjs` (bold is read only under Onboarding)                                            | `check:code`                         |
| Notes and e2e helpers are walked when the onboarding flow version moves            | The same test checks their numbers in `tools/onboarding-walks.json`, not the walk                                | `check:code`, number only            |
| e2e helpers use the app's current labels                                           | `e2e ios` workflow, on the `run-e2e` label, not required                                                         | nowhere blocking                     |
| Public Convex `args` and `returns` stay compatible                                 | `tools/verify-convex-api.mjs` from the fork point; one trailer acknowledges the whole range                      | CI `convex api contract`             |
| OTA reaches only builds with the same native fingerprint                           | `tools/verify-ota-compatibility.mjs` blocks the publish; `tools/verify-native-fingerprint.mjs` only warns on PRs | OTA `before_update`; CI warns        |
| A PR shows how it was verified; UI shows a screenshot                              | `tools/verify-pr-evidence.mjs`                                                                                   | CI `PR evidence`                     |
| No high or critical advisories                                                     | `pnpm run audit`                                                                                                 | `check`, CI on dependency PRs, daily |
| Public queries and mutations use the auth builders or are in `PUBLIC_ON_PURPOSE`   | `convex/model/publicFunctions.test.ts`; public actions stay review-only                                          | `check:code`                         |
| A built function refuses a signed-out and a deleting caller before its handler     | The same test calls each one with a ctx stub                                                                     | `check:code`                         |
| A `PUBLIC_ON_PURPOSE` reason matches its handler                                   | Review against `REVIEW.md`; CODEOWNERS only labels the file                                                      | nowhere                              |
| No client `userId`; `liveOwner` before acting for an account                       | Review against `REVIEW.md`                                                                                       | nowhere                              |
| `requireProEntitlement`; `aiAllowed` before content leaves                         | Review against `REVIEW.md`                                                                                       | nowhere                              |
| AI passes touch only `suggested` memberships                                       | Review against `REVIEW.md`                                                                                       | nowhere                              |
| No database `.filter((q) => ...)` in `convex/` outside tests                       | ESLint `no-restricted-syntax` (name an index instead)                                                            | `lint`                               |
| `logEvent` scalars; `safeFetch`                                                    | Review against `REVIEW.md`                                                                                       | nowhere                              |
| Convex test harnesses come from `newConvexTest()`                                  | ESLint `no-restricted-imports` on `convexTest` outside `convex/test.setup.ts`                                    | `lint`                               |
| No test file under `src/app`                                                       | ESLint `no-restricted-syntax` on `src/app/**/*.{test,spec}.*`                                                    | `lint`                               |
| `captureError`                                                                     | Review against `REVIEW.md`                                                                                       | nowhere                              |
