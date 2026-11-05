# CLAUDE.md

This file provides guidance when working with code in this repository.

@AGENTS.md carries the "where things live" map for both apps. Check it before searching
for a module.

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

**Client**

- Web (`apps/web/.env.example`): `CONVEX_URL` is optional unless a server-backed marketing form
  is enabled; the Android waitlist route returns 503 without it. No auth env vars
- Web: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST`: web analytics keys.
  Analytics is a no-op when either is unset
- Web: `NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN`: optional App Store Connect provider token. With
  it, App Store links carry `ct=` campaign tokens; see
  [growth funnel](docs/analytics/growth-funnel.md)
- Native (copy `apps/native/.example.env` to `.env.local`):
  - `EXPO_PUBLIC_CONVEX_URL`: the Convex deployment URL the client connects to. `app.config.js`
    rejects the production URL on dev and preview builds
  - `EXPO_PUBLIC_CONVEX_SITE_URL`: the deployment's HTTP Actions origin
  - `EXPO_PUBLIC_WEB_URL`: optional web origin for plan voting links. Local QA uses
    a web server connected to the same development Convex backend; unset uses the
    production website.
  - `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS`: optional, mirrors the backend `AUTH_ENABLE_ANONYMOUS`
    to show the passwordless dev-login button and fixture reset on development builds
    (release-mode included); preview and production builds never show either
  - `EXPO_PUBLIC_REVENUECAT_TEST_KEY`: RevenueCat Development Test Store key used by
    non-production debug builds only; release-mode dev and preview builds skip RevenueCat
    configuration because the SDK rejects test keys outside debug. `app.config.js` pins it
    to one exact value
  - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`: RevenueCat public
    SDK keys used only by production builds. The entitlement stays `none` until a key is set and
    a subscription row is written
  - `GOOGLE_MAPS_API_KEY`: Google Maps key injected into the Android config, needed by
    `expo-maps` on the map screen. A production Android EAS build fails without it, so the map
    screen never ships unconfigured
  - `GOOGLE_SERVICES_JSON`: EAS secret file variable containing Firebase's
    `google-services.json`; required by every Android EAS build, with a Firebase
    client matching that variant's package, so `expo-notifications` can obtain an
    FCM token. See [push notification builds and updates](docs/architecture/push-notifications.md)
    for credentials, rebuilding existing installs, and OTA fingerprint consistency
  - `POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST`: build-time PostHog config baked into
    `expoConfig.extra`. The client analytics module is undefined unless both resolve
  - `POSTHOG_CLI_API_KEY`: PostHog personal API key (scopes: error tracking write, organization
    read). `app.config.js` adds the `posthog-react-native/expo` source map upload plugin only when
    this is set, so a build without it keeps working and uploads switch on the moment the EAS
    secret is added. The upload runs inside the native build and needs `@posthog/cli` available
    there, plus `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST` set beside it as EAS environment
    variables. Turning the upload on adds a config plugin, so it moves the fingerprint and needs a
    store build.
    `metro.config.js` stamps the matching debug id into every bundle regardless

**Convex deployment** (via `convex env set` or dashboard). The app-owned names are declared in
`apps/native/convex/convex.config.ts`; Convex Auth reads its `JWT_PRIVATE_KEY`, `JWKS`, and
`AUTH_*` variables itself. Only `GOOGLE_GENERATIVE_AI_API_KEY` is marked required there, so a
deploy fails without it. The auth and integration variables are optional at deploy time and are
needed at runtime by the features that use them:

- `JWT_PRIVATE_KEY` / `JWKS`: RS256 keypair Convex Auth uses to sign its JWTs (generate via
  `node generateKeys.mjs`, see [Manual Setup](https://labs.convex.dev/auth/setup/manual))
- `CONVEX_SITE_URL`: set by Convex; `auth.config.ts` uses it as the JWT issuer domain
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google OAuth client credentials
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET`: Sign-in-with-Apple Service ID + signed JWT secret
- `APPLE_RETENTION_MESSAGE_ID`: id of the Apple-approved retention message
  `/retention-messaging` names on the cancel sheet. Unset, the reply is empty and Apple shows
  the default message configured for the product
- `APPLE_RETENTION_OFFERS`: JSON from product id to `{ offerIdentifier, messageIdentifier }`.
  A listed product gets that App Store Connect promotional offer on the cancel sheet, signed
  for the subscriber's original transaction; any other product gets the plain message
- `APPLE_IAP_PRIVATE_KEY` / `APPLE_IAP_KEY_ID` / `APPLE_IAP_ISSUER_ID`: the Apple In-App
  Purchase key (`.p8` contents), its key id and issuer id, which sign those offers. Unset,
  `/retention-messaging` sends the plain message and logs `retention_offer_skipped`
- `APPLE_REVOKE_PRIVATE_KEY` / `APPLE_REVOKE_KEY_ID` / `APPLE_REVOKE_TEAM_ID`: the Sign in
  with Apple key (`.p8` contents), its key id, and the Apple team id. `appleRevoke.ts` signs
  the client secret with them to revoke a deleted account's Apple token. All optional:
  without them deletion still completes and the revocation is skipped with a log line
- `APPLE_MAPS_PRIVATE_KEY` / `APPLE_MAPS_KEY_ID` / `APPLE_MAPS_TEAM_ID`: a MapKit key
  (`.p8` contents), its key id, and the Apple team id. `trips.ts` signs the Apple Maps Server
  API token with them to pin a trip's stops (free up to 25,000 calls a day per team; past
  that Apple answers 429 and stops show without pins). All optional: without them trips have
  no pins
- `AUTH_ENABLE_ANONYMOUS`: set to `"true"` on the dev deployment only to enable passwordless
  dev sign-in and the fixture reset in `devFixtures.ts`
- `GOOGLE_GENERATIVE_AI_API_KEY`: Google AI Studio API key for classification (used directly by
  `@ai-sdk/google`, no gateway). The only required entry
- `E2E_FAKE_AI`: set to `local-v1` only by the `e2e ios` workflow's local backend. It swaps
  Gemini for the deterministic fake in `model/fakeAi.ts` (which also serves its fixture pages
  at `https://fixtures.e2e.invalid/` to link saves, reads cities and places off them, and
  answers plan calls), and only when the backend is on
  127.0.0.1, `AUTH_ENABLE_ANONYMOUS` is `"true"` and the model key is the `ci-no-model`
  placeholder. Anywhere else it is refused and logged as `fake_ai_refused`
- `POSTHOG_PROJECT_TOKEN`: server-side PostHog ingestion key. All backend capture is skipped
  when it is unset
- `POSTHOG_HOST`: PostHog ingestion host. Defaults to `https://us.i.posthog.com`
- `OBSERVABILITY_ENV`: tags captured events with an `environment` property. Set it to
  `production` on the production deployment
- `REVENUECAT_WEBHOOK_SECRET`: shared bearer secret authenticating RevenueCat webhook posts.
  The route answers 500 when it is unset
- `REVENUECAT_API_KEY`: RevenueCat REST key used to re-read subscribers when reconciling a
  `TRANSFER`, `BILLING_ISSUE`, refund, `REFUND_REVERSED` or `EXPIRATION` webhook event (an expiring
  product says nothing about a dated grant that still covers the account). Those reconciliations return
  503 without this key so RevenueCat retries instead of leaving access silently out of sync
- `REVENUECAT_ENTITLEMENT_ID`: entitlement name read from the RevenueCat subscriber snapshot.
  Defaults to `Shelvr Pro`
- `SAVE_REMINDERS_ENABLED`: save reminders send only while this is `"true"`. Unset by
  default, so a deploy never starts them; set it back to anything else to stop them, queued
  ones included, without a deploy. See
  [contextual notifications](docs/architecture/contextual-notifications.md)
- `FREE_SAVES_ENABLED`: the free plan's 10 saves (`freeSaves.ts`) work only while this is
  `"true"`. Unset, every save without Pro is refused as before
- `SERPAPI_KEY`: SerpAPI key for `findProductLinks`. The search fails without it
- `YOUTUBE_API_KEY` — optional YouTube Data API v3 key for video descriptions and metadata.
  Missing key, quota/auth rejection, network failure or unusable responses preserve the existing
  oEmbed fallback; oEmbed-only metadata never enables caption recipe extraction.
- `TREG_API_KEY` / `VIDEO_TRANSCRIPTS_ENABLED`: Treg token for the spoken transcript of a
  cooking TikTok or reel whose caption has no recipe, or one that recommends or visits places
  (`model/videoTranscript.ts`, about $0.002
  each, rate limited per user and globally). The same pair pays for a TikTok's caption when
  oEmbed returns none (`model/readers/tiktok.ts`, about $0.002 each, its own per-user limit,
  the shared global one; the web reel finder has its own budget). Both are fetched only while the switch is `"true"` and the key is
  set; set the switch to anything else to stop them with no deploy
- `RESEND_API_KEY`: Resend key for the waitlist contact projection. Without it, rows stay
  `unconfigured` and no attempt is spent
- `RESEND_SEGMENT_ID`: Resend segment for `shelvr` waitlist signups
- `RESEND_ANDROID_SEGMENT_ID`: Resend segment for `shelvr-android` signups. Android rows stay
  `unconfigured` until it is set
- `RESEND_TOPIC_ID`: Resend topic the contact is opted into
- `RESEND_FEEDBACK_INBOX_EMAIL`: Resend address in-app feedback is projected to. Together with
  `RESEND_FEEDBACK_FROM_EMAIL` and `RESEND_API_KEY` it gates configured delivery; submissions stay
  `unconfigured` until all three are set
- `RESEND_FEEDBACK_FROM_EMAIL`: verified Resend sending address for feedback email, required with
  the inbox address and `RESEND_API_KEY` for delivery

## Working conventions

- Do not reintroduce the old notes-app domain (`notes` table, OpenAI summary action, `/notes`
  routes). The product domain is **items + spaces**. `GLOSSARY.md` names the domain's terms: say
  "save" in copy and docs while tables and code keep `items`.
- Never pass `userId` from the client into Convex public functions. Build a public query or
  mutation with `authedQuery` or `authedMutation` from `model/auth.ts` and read `ctx.userId`. A
  function that must answer a signed-out or deleting caller goes in `PUBLIC_ON_PURPOSE` in
  `model/publicFunctions.ts` with a reason.
- Keep `returns:` validators accurate. Convex enforces them at runtime.
- Prefer `withIndex` / search indexes over `.filter()` on growing tables.
- Public Convex functions are contracts with every app build in the wild, and the backend
  deploys independently of the app (`npx convex deploy` is manual; OTA updates land one launch
  later; store builds lag for weeks). Never change a public function's argument or return shape
  in the same release that moves the client. Expand first (add a new function or accept both
  shapes), deploy, move the client, then contract once the production update channel shows no
  old bundle still calling it. CI enforces the first half: `tools/verify-convex-api.mjs`
  resolves every public function's `args` and `returns` to their full text, following the
  shared validators they reference, and fails a pull request that changes or removes one.
  Withdrawing a function's `export`, or switching it between `query`, `mutation` and
  `action`, counts the same way. Acknowledge a change an installed app survives, or the
  expand half of the sequence, with a `Convex-Api: changed` trailer on a commit in the
  range. It cannot yet tell widening from narrowing, so an added field asks for the
  trailer too.
- Gate every Pro feature with `requireProEntitlement(ctx, userId)` from `subscriptions.ts`.
  Link and note saves are gated by `claimSave` in `freeSaves.ts`, which also counts free saves.
- Never log raw `console.*`: use `logEvent` (Convex), `serverLog` (web server), or
  `analytics.captureError` (native app) so events land in the Convex log stream or PostHog
  error tracking in a queryable shape. Keep messages, URLs, and user content out of log
  fields. Log categories and codes instead.
- The classifier and recommendation passes may only create or remove `suggested` memberships in
  `spaceItems`. The one exception is a space the user set to auto-file (`spaces.autoFile`, only
  while `dynamic` is on): the classifier inserts its new matches there as `saved`, the user's
  standing opt-in replacing the per-item accept. It applies only to saves made after auto-file was
  turned on, and never changes an existing `saved`, `dismissed` or legacy row. Purpose
  steering (`steerItemForSpace`) may update `intents` on `saved` memberships without changing
  their status. `saved` and `dismissed` statuses are user-owned, so no AI pass ever overwrites a
  user decision.
- Deploy the backend before the client that needs it; `AGENTS.md` → Deployment says how
  `deploy.yml` and `release.yml` keep that order.
- An OTA update only reaches installs whose store build shares its native fingerprint. A
  change to a native module, a config plugin, `app.json` or `app.config.js` may move the
  fingerprint, and a moved fingerprint strands every later OTA until a store build ships.
  The diff does not say so. Two layers cover it. On a pull request CI runs
  `tools/verify-native-fingerprint.mjs --warn-only`, which names every source that moved
  and never fails the check; acknowledge an intended move with the
  `Native-Fingerprint: changed` trailer on a commit in the range. At publish time the OTA
  workflow's `before_update` hook runs `tools/verify-ota-compatibility.mjs`, which
  compares the fingerprint the update is about to carry against
  `apps/native/released-builds.json` and blocks the publish on anything but a match,
  including a profile or platform with no recorded release. A blocked publish means
  nothing published from this tree reaches the recorded binary, so the usual fix is a
  store build, and recording the release afterwards. Do not predict a move: run
  `pnpm run verify:fingerprint origin/main HEAD`. The warning checks the production variant
  only, and it cannot see `eas.json` build fields, `.easignore` edits or pnpm patches, so
  decide those by hand. What the fingerprint hashes, and what it cannot see, is in
  [push notification builds and updates](docs/architecture/push-notifications.md#what-the-fingerprint-hashes).
- Adding a field to a table is a one-way door once rows carry it. Convex validates
  every existing document against the new schema on deploy, and a table validator
  rejects a field it does not declare, failing with an "Unexpected field" error
  naming it. So reverting the commit that added the field fails the deploy instead
  of rolling it back. To back a field out, stop writing it and leave it declared
  `v.optional(...)`; drop the declaration only once no row still has it.
- Every pull request (Renovate and Dependabot aside) fills in the template's Verification section: what was run and its result,
  the evidence, and what was not verified. Never call work "done" or "verified" without evidence
  a reviewer can open. A pull request that touches UI files (`apps/native/src/**/*.tsx`, locales,
  assets, native view modules, app config, push copy, `apps/web` UI; `UI_PATTERNS` in
  `tools/verify-pr-evidence.mjs` is the full list) embeds a screenshot or recording under Evidence. When those files
  changed but nothing on screen did, the author (an agent included) says why under Evidence and
  adds the `no-ui-change` label when opening the pull request (`gh pr create --label no-ui-change`);
  a visible change never takes the label. The `PR evidence` workflow (`tools/verify-pr-evidence.mjs`, run as the base
  branch has it via `pull_request_target`) fails a ready pull request otherwise and re-runs on description and label edits.
- Build Convex test harnesses with `newConvexTest()` from `convex/test.setup.ts`, never with a
  bare `convexTest(schema, ...)`.
- A new schema table, top-level Convex module or `(app)` route needs a line in this file.
  `tools/verify-agent-docs.mjs` (`pnpm run verify:agent-docs`, part of `pnpm run check` and CI)
  fails until the name appears here in backticks.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`apps/native/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `apps/native`.

<!-- convex-ai-end -->
