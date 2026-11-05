# CLAUDE.md

This file provides guidance when working with code in this repository.

@AGENTS.md carries the "where things live" map for both apps. Check it before searching
for a module.

To review a change, follow `REVIEW.md` in full, including when a `/code-review` command is
running: its findings must meet `REVIEW.md`'s proof rule and use its tags and report format.

> Expo docs change quickly. Before writing native app code, read the versioned docs
> for the SDK pinned in `apps/native/package.json` (currently Expo SDK 58):
> https://docs.expo.dev/versions/v58.0.0/

## What this is

**Shelvr** is a "save-it-for-later" hub. Users capture links, images, and notes; a Convex
backend action fetches/extracts content and an LLM classifies each item (title, description,
tags, cities, places, and which "spaces" it belongs to). The app today has one flow: save a
reel, TikTok or link, and its places show under its city on Home; a city page has a map of
those places and Plan a date / Plan a trip. Items can be organized into **spaces** (themed
collections). The app no longer shows spaces, but the backend keeps them for old builds and
for the hidden space behind each city's plans. Creating a new space runs one recommendation
pass over existing items. That pass writes `suggested` memberships only. The user accepts or
dismisses each suggestion.

## Monorepo layout

| Path          | Role                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| `apps/web`    | Next.js marketing / landing site; server routes may call Convex for waitlists      |
| `apps/native` | Expo Router native app (includes `convex/` backend)                                |
| `tools/e2e`   | End-to-end flow tests for the iOS simulator (pilot; see the README's Test section) |

Convex types/API are imported as `@convex/_generated/*` (path alias resolves to `./convex/*`).

This repo holds product code, tests, release tooling, and agent configuration only. `docs/`
carries what an agent needs to change the product safely: analytics event methodology and SQL,
the App Store review process, and architecture decisions. Business notes, marketing copy and
assets, dated metric snapshots, research, and store media (videos, screenshots) live in the
separate `shelvr-notes` repo. Do not add them here.

## Toolchain & commands

**Use `pnpm`** (workspace package manager). Root scripts go through Turbo.

- `pnpm install`: install deps
- `pnpm dev`: run web (`next dev`) + native (`expo start`) via Turbo. It does not start the
  Convex backend; run `convex dev` in a second terminal
- `pnpm typecheck`: typecheck all packages
- `pnpm --filter native-app start`: Expo Metro
- `pnpm --filter native-app exec convex dev`:
  Convex backend against the dev deployment; keeps `convex/_generated/*` in sync
- `pnpm --filter web-app dev`: Next.js dev server
- `pnpm --filter web-app lint`: ESLint
- `pnpm --filter native-app test`: Vitest suite (`vitest run`)
- `pnpm run check`: the whole gate, from the repo root. `check:code` is the part CI runs on
  every push and the pre-push hook runs; `check` adds the dependency audit

Tests live next to the code as `*.test.ts` under `apps/native/convex/` and `apps/native/src/`.
`apps/native/vitest.config.ts` includes both trees and runs Node as the default environment.
Convex function tests use [`convex-test`](https://docs.convex.dev/testing/convex-test) and opt
into the edge runtime per file with a `// @vitest-environment edge-runtime` pragma. Build the
test harness through `newConvexTest()` in `apps/native/convex/test.setup.ts`; it registers the
rate-limiter component, without which any mutation that calls `rateLimiter.limit` fails.

## Architecture

This section is an index: read the code for how a module behaves. `tools/verify-agent-docs.mjs`
requires every table, module and route to appear here in backticks. What the code cannot tell
you is under "What grep won't tell you" below.

### Backend (`apps/native/convex/`), the source of truth

Convex is the database, file storage, scheduler and AI orchestration. Auth is
[Convex Auth](https://labs.convex.dev/auth/) (`auth.ts`, `auth.config.ts`); it issues its own
JWTs, and `model/auth.ts` turns the JWT `sub` into the stable users-table id every app table
keys on.

Rules that cross modules:

- **Callers.** A public query or mutation is built with `authedQuery` / `authedMutation`
  (`model/auth.ts`) and reads `ctx.userId`. One that must answer a signed-out or deleting
  caller is listed with a reason in `PUBLIC_ON_PURPOSE` (`model/publicFunctions.ts`);
  `model/publicFunctions.test.ts` fails on anything else. Public actions have no builder: they
  derive the caller through the internal query or mutation they run.
- **Live owner.** `users.deleting` is a one-way marker set by `deleteCurrentUserAccount`.
  `liveOwner` (`model/auth.ts`) is the one definition of an account that may still own data;
  use it before acting for an account outside the builders.
- **AI permission.** Every path that sends a user's content to Gemini, SerpAPI or Treg checks
  `aiAllowed` / `isAllowed` (`aiConsent.ts`) first, and so do the current Apple Maps lookups
  (pins, Plan a date, Plan a trip). No preference record means allowed. With a legacy decline
  those calls are skipped; the save is still read (`readPage`) and settles from that reading.
  The old-build `trips.ts` calls Apple Maps without this check.
- **Settlement.** `completionPatch` and `failurePatch` in `model/settlement.ts` decide what a
  processing run writes to a save; `finalizeItem` and `failItem` are their adapters. Re-record
  `testdata/settlement/rows.json` only for an intended change, and review its diff.
- **External fetches** go through `model/safeFetch.ts`; host knowledge lives in the page readers
  under `model/readers/`, never in `ai.ts`.
- **Logging** goes through `logEvent` (`model/log.ts`): one JSON line, scalar fields only.
- **AI model:** `gemini-3.1-flash-lite` through `@ai-sdk/google`
  (`GOOGLE_GENERATIVE_AI_API_KEY`).
- For any edit in `convex/`, prefer the `convex-expert` skill.

**Tables** (`schema.ts`, plus Convex Auth's `authTables`):

- Saves: `items` (`processing`, then `ready` or `failed`; `search_text` full-text index),
  `itemOperations` (import idempotency), `itemReads`, `shareLinks`, `onboardingDemos`,
  `freeSaves` (the free plan's 10 saves)
- Spaces (old builds, and the hidden space behind a city's plans): `spaces`, `spaceItems`
  (`suggested` / `saved` / `dismissed`)
- Places and plans: `placeRemovals`, `placeVisits`, `planShares`, `planVotes`, `trips` (old
  builds), `tripPlans`, `tripStops`
- Shared lists: `sharedLists`, `sharedListMembers`, `sharedListPlaces`
- Notifications: `notificationDevices`, `notificationPreferences`, `weeklyDigests`,
  `saveReminders`, `tripEveReminders`
- Account and billing: `users` (redeclared with optional `appleRefreshToken` and `deleting`),
  `subscriptions`, `paymentAnalyticsReceipts`, `legalConsents`, `aiConsents`, `cancelSurveys`,
  `captureTokens`, `appleTokens`, `detachedAppleTokens`
- Inbound: `waitlistSignups`, `feedbackSubmissions`

**Modules:**

| Area            | Modules                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saves           | `items.ts`, `ai.ts` (processing pipeline), `freeSaves.ts`, `demo.ts`, `appIntents.ts` (Siri and Shortcuts), `reelPlaces.ts` and `oracle.ts` / `oracleLimits.ts` (web tools)  |
| Places          | `placePins.ts`, `placeCorrections.ts`, `placeCorrectionSearch.ts`, `placeRemovals.ts`, `placeVisits.ts`, `mapPlaces.ts`                                                      |
| Plans and trips | `datePlans.ts` / `datePlanData.ts`, `tripPlanner.ts` / `tripPlannerData.ts`, `planShares.ts`, `sharedLists.ts`; old builds: `plans.ts`, `trips.ts` / `tripData.ts`           |
| Spaces          | `spaces.ts`, `aiRecommendForSpace.ts`, `aiEmbeddingSweep.ts` (retired no-op)                                                                                                 |
| Account         | `users.ts`, `auth.ts`, `auth.config.ts`, `appleProfile.ts`, `appleRevoke.ts`, `aiConsent.ts`, `legalConsent.ts`, `legalConsentSync.ts`, `devFixtures.ts`                     |
| Billing         | `subscriptions.ts` (`requireProEntitlement`), `cancelSurvey.ts`, `paymentTelemetry.ts`                                                                                       |
| Notifications   | `notifications.ts`, `notificationDelivery.ts`                                                                                                                                |
| Plumbing        | `http.ts` (every HTTP route), `crons.ts`, `health.ts`, `schema.ts`, `convex.config.ts`, `waitlist.ts`, `feedback.ts`, `analytics.ts`, `accountTelemetry.ts`, `test.setup.ts` |

#### What grep won't tell you

- **Old-build code looks dead but is a live contract.** `trips.ts`, `tripData.ts`, `plans.ts`,
  the space CRUD and suggestion functions in `spaces.ts`, `ensureCitySpace`,
  `aiRecommendForSpace.ts`, the no-op `aiEmbeddingSweep.ts` and the old sweep exports in `ai.ts`
  have no caller in the current app. Installed builds and queued jobs still call them: do not
  delete or narrow them (see the contract rule under Working conventions).
- **Declared because rows carry them.** Keep these in the schema through any rollback:
  `users.deleting`, `items.embedding` / `embeddingVersion` /
  `embeddingAttempts`, `items.placeLocations`, `tripPlans.listId`, and the `placeRemovals` and
  `tripEveReminders` tables.
- **Run-by-hand backfills** after deploying the change that needs them, from `apps/native`:
  `pnpm exec convex run --prod <fn> '{"cursor":null}'` with `items:backfillPlaceSearch`
  (finish it before releasing the search UI), `items:clearEmbeddings` or
  `placePins:backfillPage`. Each schedules its remaining pages and is safe to restart.
- **Privacy rules the code enforces on purpose:** a shared list's place search sends Apple only
  the city name, never a member's pin; a plan from a shared list needs every contributor's AI
  permission, former members included; `sharedListPlaces` copies no save title or text, and
  its `itemId` goes only to the person who added it; an Apple refresh token is never returned,
  logged or passed as a scheduled job argument (`detachedAppleTokens` holds it instead); public
  item reads strip `places` and `placeLocations`.
- **An AI check cannot recall a request.** `aiAllowed` runs before a request goes out; a decline
  that lands mid-run is handled at settlement, which ignores the classification.
- **Rows outlive saves.** Deleting a save keeps its `tripStops` and `sharedListPlaces` rows.
- **Google Maps lists** are read through Google's undocumented list endpoint
  (`model/readers/googleMaps.ts`). A format change fails quietly to a plain page read.

### Web (`apps/web`)

Next.js App Router marketing site only, no auth or product UI. Server routes may call Convex
for marketing forms and the free tools (`/reel-place-finder`, the Oracle), which forward to the
Convex HTTP routes and store nothing.

### Native (`apps/native`)

Expo Router under `src/app`, with `(auth)` (one `sign-in` route) and `(app)` groups; Convex
Auth via `ConvexAuthProvider` with `expo-secure-store`. Before UI work read
[design system](docs/architecture/design-system.md); before visible copy read
[localization](docs/architecture/localization.md) and run `pnpm localization:generate` from the
repo root; before simulator QA read [local QA](docs/architecture/local-qa.md).

Routes in `(app)`:

- Tabs: `(home)` (Home: plan tiles, city cards, shared lists, review line), `(map)` (every
  mapped place), `(trips)` (My trips)
- Places: `city/[name]`, `spots/[id]` (after sharing), `item/[id]`, `edit-save-places`
- Plans: `date-plan`, `new-trip`, `trip-plan/[id]`, `add-trip-stop`
- Shared lists: `shared-list/[id]`, `new-shared-list`, `add-list-place` (the Join screen is the
  root route `list-invite/[token]`)
- Saving: `add` (a pasted link), `share`
- Account: `onboarding`, `paywall`, `plan-gate` (hard paywall), `profile`, `settings`

Retired screens' links open Home through `src/lib/home-href.ts` and `src/app/+native-intent.ts`.
Scheme `shelvr`; bundle id `app.shelvr.save`, with `.dev` / `.preview` appended for the other
`APP_VARIANT` profiles.

## Path aliases

- Web: `@/*` maps to `apps/web/src/*`
- Native: `@/*` maps to `apps/native/src/*`, `@convex/*` to `apps/native/convex/*`
- Import Convex API as `@convex/_generated/api`

## Environment variables

[Environment variables](docs/architecture/environment.md) lists every client and Convex
variable. For the app, copy `apps/native/.example.env` to `.env.local`. On the Convex
deployment only `GOOGLE_GENERATIVE_AI_API_KEY` is required. Feature switches such as
`FREE_SAVES_ENABLED`, `SAVE_REMINDERS_ENABLED` and `VIDEO_TRANSCRIPTS_ENABLED` stay off
until set to `"true"`, so a deploy never turns one on.

## Working conventions

`AGENTS.md` lists the one-line boundaries (no client `userId`, indexes, accurate validators,
`requireProEntitlement` and `claimSave`, logging, `newConvexTest()`) and what enforces
each. These rules need more than a line:

- **Public Convex functions are contracts.** The backend deploys on its own, OTA updates
  land one launch later and store builds lag for weeks, so an installed app keeps calling
  old shapes. Never change a public function's `args` or `returns` in the release that
  moves the client: expand (add a function or accept both shapes), deploy, move the
  client, then contract once the production channel shows no old bundle calling it.
  `tools/verify-convex-api.mjs` fails a pull request that changes or removes a public
  function's `args`, `returns`, `export` or kind (`query`, `mutation`, `action`).
  Acknowledge an intended change with a `Convex-Api: changed` trailer. It cannot tell
  widening from narrowing, so an added field needs the trailer too.
- **AI passes write only `suggested` memberships** in `spaceItems`. Two exceptions: in a
  space with `autoFile` on (only while `dynamic` is on) the classifier inserts new matches
  as `saved`, for saves made after auto-file was turned on, never changing an existing
  row; and `steerItemForSpace` may update `intents` on `saved` memberships without
  changing their status. `saved` and `dismissed` belong to the user, and no AI pass
  overwrites them.
- **A table field is a one-way door.** Convex validates every row against the schema on
  deploy and rejects an undeclared field, so reverting the commit that added a field
  fails the deploy. To back one out, stop writing it, keep it declared `v.optional(...)`,
  and drop the declaration once no row has it.
- **A moved native fingerprint strands OTA updates.** A change to a native module, a
  config plugin, `app.json` or `app.config.js` may move it, and the diff does not show
  it. Run `pnpm run verify:fingerprint origin/main HEAD` instead of guessing, and
  acknowledge an intended move with a `Native-Fingerprint: changed` trailer. The OTA
  workflow's `before_update` hook (`tools/verify-ota-compatibility.mjs`) blocks a publish
  whose fingerprint does not match `apps/native/released-builds.json`; the fix is a store
  build, then recording the release. The pull-request check covers only the production
  variant and cannot see `eas.json` build fields, `.easignore` edits or pnpm patches.
  Details: [push notification builds and updates](docs/architecture/push-notifications.md#what-the-fingerprint-hashes).
- **Every pull request shows how it was verified** in the template's Verification section
  (Renovate and Dependabot aside): what ran and its result, evidence a reviewer can open,
  and what was not verified. A pull request that touches UI files (`UI_PATTERNS` in
  `tools/verify-pr-evidence.mjs`) embeds a screenshot or recording. If nothing on screen
  changed, say why under Evidence and add the `no-ui-change` label
  (`gh pr create --label no-ui-change`). The `PR evidence` check fails a ready pull
  request otherwise.
- **A new table, top-level Convex module or `(app)` route needs a line in this file.**
  `tools/verify-agent-docs.mjs` fails until the name appears here in backticks.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`apps/native/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `apps/native`.

<!-- convex-ai-end -->
