# CLAUDE.md

This file provides guidance when working with code in this repository.

> Expo docs change quickly. Before writing native app code, read the versioned docs
> for the SDK pinned in `apps/native/package.json` (currently Expo SDK 57):
> https://docs.expo.dev/versions/v57.0.0/

## What this is

**Shelvr** is a "save-it-for-later" hub. Users capture links, images, and notes; a Convex
backend action fetches/extracts content and an LLM classifies each item (title, description,
tags, and which "spaces" it belongs to). Clients render a feed of saves. Items can be
organized into **spaces** (themed collections). Creating a new space runs one recommendation
pass over existing items. That pass writes `suggested` memberships only. The user accepts or
dismisses each suggestion.

## Monorepo layout

| Path          | Role                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `apps/web`    | Next.js marketing / landing site; server routes may call Convex for waitlists |
| `apps/native` | Expo Router native app (includes `convex/` backend)                           |

Convex types/API are imported as `@convex/_generated/*` (path alias resolves to `./convex/*`).

This repo holds product code, tests, release tooling, and agent configuration only. `docs/`
carries what an agent needs to change the product safely: analytics event methodology and SQL,
the App Store review process, and architecture decisions. Business notes, marketing copy and
assets, dated metric snapshots, research, and store media (videos, screenshots) live in the
separate `shelvr-notes` repo. Do not add them here.

## Toolchain & commands

**Use `pnpm`** (workspace package manager). Root scripts go through Turbo.

- `pnpm install` — install deps
- `pnpm dev` — run web (`next dev`) + native (`expo start`) via Turbo. It does not start the
  Convex backend; run `convex dev` in a second terminal
- `pnpm typecheck` — typecheck all packages
- `pnpm --filter native-app start` — Expo Metro
- `pnpm --filter native-app exec convex dev` —
  Convex backend against the dev deployment; keeps `convex/_generated/*` in sync
- `pnpm --filter web-app dev` — Next.js dev server
- `pnpm --filter web-app lint` — ESLint
- `pnpm --filter native-app test` — Vitest suite (`vitest run`)
- `pnpm --filter native-app check` — lint, then typecheck, then test

Tests live next to the code as `*.test.ts` under `apps/native/convex/` and `apps/native/src/`.
`apps/native/vitest.config.ts` includes both trees and runs Node as the default environment.
Convex function tests use [`convex-test`](https://docs.convex.dev/testing/convex-test) and opt
into the edge runtime per file with a `// @vitest-environment edge-runtime` pragma. Build the
test harness through `newConvexTest()` in `apps/native/convex/test.setup.ts`; it registers the
rate-limiter component, without which any mutation that calls `rateLimiter.limit` fails.

## Architecture

### Backend (`apps/native/convex/`) — source of truth

Convex is the reactive backend + database + file storage + AI orchestration. Auth is
[Convex Auth](https://labs.convex.dev/auth/) (`@convex-dev/auth`), configured in `convex/auth.ts`
and wired in `convex/auth.config.ts`. Convex Auth issues its own JWTs (signed with the
`JWT_PRIVATE_KEY` / `JWKS` deployment vars); the JWT `sub` contains the users-table id and session
id, and `model/auth.ts` extracts the stable users-table id used by every app table.

- **`schema.ts`** — the Convex Auth tables (`authTables`) plus these app tables:
  - `items` — saved links, images, and notes (`processing` → `ready` | `failed`)
  - `spaces` — themed collections owned by a user
  - `spaceItems` — item/space membership join, with a `suggested` / `saved` / `dismissed` status
  - `itemOperations` — per-import idempotency ledger for image, link, and note saves
  - `subscriptions` — one Pro entitlement row per user, written by the RevenueCat webhook
  - `paymentAnalyticsReceipts` — seen payment event ids, so telemetry is not double counted
  - `notificationDevices` — one Expo push token per device, scoped to a user
  - `notificationPreferences` — weekly shelf opt-in, timezone, and the next digest instant
  - `itemReads` — per-user read state, kept out of the item row
  - `weeklyDigests` — the persisted weekly shelf and its delivery state
  - `waitlistSignups` — waitlist source of truth, projected to Resend

  `items` has `by_user`, `by_user_and_type`, and `by_storage` indexes plus a `search_text`
  full-text search index (filtered by `userId`).

- **`items.ts`** — public queries `listItems`, `getItem`, `searchItems`, `similarItems`,
  `photoUsage`, and `getImportOperation`. Image saves run a three-step, idempotent import:
  `beginImageImport` → `attachImageUpload` → `finalizeImageImport`, all keyed on a
  client-generated `operationId` in `itemOperations`. Other public mutations are
  `createLinkItem`, `createNoteItem`, `findLinks` (user-triggered product search),
  `reprocessItem` (retry a failed or partially enriched save), and `deleteItem`. The rest of the
  file is internal helpers the AI action calls (`finalizeItem`, `failItem`, `setSpacesForItem`,
  `suggestItemsForSpace`, `cleanupStaleImageImports`, and others). `enrichItem` resolves
  `storageId` to an `imageUrl` at read time.
- **`spaces.ts`** — public space CRUD (`listSpaces`, `getSpace`, `createSpace`, `updateSpace`,
  `deleteSpace`), membership writes (`addItemToSpace`, `removeItemFromSpace`), and the
  suggestion decisions (`acceptSuggestion`, `undoAcceptSuggestion`, `dismissSuggestion`,
  `acceptAllSuggestions`), plus internal join helpers.
- **`subscriptions.ts`** — `getEntitlement` query for the client and the
  `requireProEntitlement(ctx, userId)` helper that gates every save and Pro feature. The
  `upsertSubscription`, `transferOwners`, and `reconcileTransfer` internals are driven by the
  RevenueCat webhook.
- **`notifications.ts`** — push and weekly shelf API: `getPreferences`, `setPreferences`,
  `registerDevice`, `unregisterDevice`, `markItemOpened`, `getDigest`, and `markDigestOpened`,
  plus internal digest preparation and send. `notificationDelivery.ts` holds the
  claim/finish/recover delivery machine.
- **`waitlist.ts`** — the public `join` action the web marketing site calls, plus the internal
  Resend projection and its bounded retry.
- **`http.ts`** — Convex Auth HTTP routes (`auth.addHttpRoutes`), the RevenueCat webhook at
  `/webhooks/revenuecat` (authenticated with the `REVENUECAT_WEBHOOK_SECRET` bearer secret),
  the waitlist receiver at `/waitlist/join`, and `GET /health` (200/503 probe for uptime
  monitors, backed by the `health.ts` `ping` query).
- **`crons.ts`** — stale image import cleanup, waitlist Resend retry, weekly shelf preparation,
  and weekly shelf delivery recovery.
- **`auth.ts`** — `convexAuth()` setup: Google + Apple OAuth (Auth.js providers) and an optional
  Anonymous provider (dev only, gated on `AUTH_ENABLE_ANONYMOUS`).
- **`users.ts`** — `getCurrentUser` query, used by the client for email display and RevenueCat
  identity sync, plus `deleteCurrentUserAccount` and its batched internal deletion.
- **`devFixtures.ts`** — `canResetCurrentUser` / `resetCurrentUser`. Both are inert unless
  `AUTH_ENABLE_ANONYMOUS` is `"true"` and the caller is a development anonymous user.
- **`analytics.ts`**, **`accountTelemetry.ts`**, **`paymentTelemetry.ts`** — server-side PostHog
  capture. Every one is a no-op when `POSTHOG_PROJECT_TOKEN` is unset.
- **`ai.ts`** (`"use node"` action) — the processing pipeline. On create, a mutation inserts the
  item as `status: "processing"` and schedules `internal.ai.processItem`. That action: for links,
  fetches the page and extracts the article body (Mozilla **Readability** via `linkedom`, with a
  regex fallback) + OpenGraph metadata + hero image aspect ratio (read from raw header bytes);
  for notes it feeds the content to the model; for images it sends the stored bytes as a file
  part. It calls `generateObject` (Vercel AI SDK, Zod schema) to produce
  title/description/tags/spaceNames/intents, maps space names back to ids, then `finalizeItem`
  flips status to `ready`. Only spaces marked `dynamic` are visible to the classifier, and its
  matches become `suggested` memberships. The file also holds `recommendForSpace` (one pass over
  existing items, scheduled by `createSpace`), `steerItemForSpace` (per-space intents, scheduled
  when an item is filed into a space), `findProductLinks` (SerpAPI Google Shopping, needs
  `SERPAPI_KEY`), and the one-off `backfillImageAspectRatios`.
- **`model/auth.ts`** — `requireUserId(ctx)` returns the stable Convex Auth users-table id (not the
  session-bearing JWT `sub`). **Every public function derives `userId` from this, never from a client
  argument.**
- **`model/log.ts`** — `logEvent(level, event, fields)` structured logging: one JSON line per event
  into the Convex log stream, scalar fields only. All backend logging goes through it (ESLint
  `no-console` enforces this).

**The AI model** is `gemini-3.1-flash-lite`, called directly through the `@ai-sdk/google` provider
(auth via the `GOOGLE_GENERATIVE_AI_API_KEY` Convex deployment env var — an AI Studio API key).

When editing anything in `convex/`, prefer the `convex-expert` skill — object-form syntax,
`args` + `returns` validators on every function, index-backed reads only.

### Web (`apps/web`)

- Next.js App Router marketing site only (no auth or product UI); server routes may call Convex
  for marketing forms such as platform waitlists
- Landing page at `/` — product experience lives in the native app

### Native (`apps/native`)

- UI localization uses `expo-localization` and i18n-js. Read
  [`docs/architecture/localization.md`](docs/architecture/localization.md) before adding visible copy;
  update all catalogs and run `pnpm localization:generate` after translation changes.
- Expo Router under `src/app`, with `(auth)` and `(app)` groups
- Convex Auth via `ConvexAuthProvider` (`@convex-dev/auth/react`) in `src/app/_layout.tsx`,
  backed by `expo-secure-store` token storage; `useConvexAuth()` (from `convex/react`) guards the
  `(auth)` / `(app)` route groups
- Tabs under `(app)/(tabs)`: `(home)`, `(spaces)`, `(tidy)`, `(map)`, `(search)`. iOS uses
  `NativeTabs` from `expo-router/unstable-native-tabs`; other platforms fall back to `AppTabs`
- Other `(app)` routes: `add`, `camera`, `share`, `onboarding`, `paywall`, `profile`,
  `new-space`, `manage-spaces`, `item/[id]`, `space/[id]`, `digest/[id]`
- `(auth)` holds a single `sign-in` route
- Scheme: `shelvr`. Bundle id: `app.shelvr.save` in production. `app.config.js` appends `.dev`
  or `.preview` for the other `APP_VARIANT` build profiles, so a dev install never collides
  with the App Store install

## Path aliases

- Web: `@/*` → `apps/web/src/*`
- Native: `@/*` → `apps/native/src/*`, `@convex/*` → `apps/native/convex/*`
- Import Convex API as `@convex/_generated/api`

## Environment variables

**Client**

- Web (`apps/web/.env.example`): `CONVEX_URL` is optional unless a server-backed marketing form
  is enabled; the Android waitlist route returns 503 without it. No auth env vars
- Web: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST` — web analytics keys.
  Analytics is a no-op when either is unset
- Native (`apps/native/.example.env` → `.env.local`):
  - `EXPO_PUBLIC_CONVEX_URL` — the Convex deployment URL the client connects to. `app.config.js`
    rejects the production URL on dev and preview builds
  - `EXPO_PUBLIC_CONVEX_SITE_URL` — the deployment's HTTP Actions origin
  - `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` — optional, mirrors the backend `AUTH_ENABLE_ANONYMOUS`
    to show the dev-only passwordless button
  - `EXPO_PUBLIC_REVENUECAT_TEST_KEY` — RevenueCat Development Test Store key used by every
    non-production variant. `app.config.js` pins it to one exact value
  - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` — RevenueCat public
    SDK keys used only by production builds. The entitlement stays `none` until a key is set and
    a subscription row is written
  - `ACTIVATION_PAL_IOS_KEY` — ActivationPal public app key. `app.config.js` writes it into the
    iOS `infoPlist` and a production iOS build fails without an `ap_pk_` value
  - `GOOGLE_MAPS_API_KEY` — Google Maps key injected into the Android config, needed by
    `expo-maps` on the map screen
  - `GOOGLE_SERVICES_JSON` — EAS secret file variable containing Firebase's
    `google-services.json`; required by every Android EAS build, with a Firebase
    client matching that variant's package, so `expo-notifications` can obtain an
    FCM token. See [push notification builds and updates](docs/architecture/push-notifications.md)
    for credentials, rebuilding existing installs, and OTA fingerprint consistency
  - `POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST` — build-time PostHog config baked into
    `expoConfig.extra`. The client analytics module is undefined unless both resolve

**Convex deployment** (via `convex env set` or dashboard). The app-owned names are declared in
`apps/native/convex/convex.config.ts`; Convex Auth reads its `JWT_PRIVATE_KEY`, `JWKS`, and
`AUTH_*` variables itself. Only `GOOGLE_GENERATIVE_AI_API_KEY` is marked required there, so a
deploy fails without it. The auth and integration variables are optional at deploy time and are
needed at runtime by the features that use them:

- `JWT_PRIVATE_KEY` / `JWKS` — RS256 keypair Convex Auth uses to sign its JWTs (generate via
  `node generateKeys.mjs`, see [Manual Setup](https://labs.convex.dev/auth/setup/manual))
- `CONVEX_SITE_URL` — set by Convex; `auth.config.ts` uses it as the JWT issuer domain
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth client credentials
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` — Sign-in-with-Apple Service ID + signed JWT secret
- `AUTH_ENABLE_ANONYMOUS` — set to `"true"` on the dev deployment only to enable passwordless
  dev sign-in and the fixture reset in `devFixtures.ts`
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google AI Studio API key for classification (used directly by
  `@ai-sdk/google`, no gateway). The only required entry
- `POSTHOG_PROJECT_TOKEN` — server-side PostHog ingestion key. All backend capture is skipped
  when it is unset
- `POSTHOG_HOST` — PostHog ingestion host. Defaults to `https://us.i.posthog.com`
- `OBSERVABILITY_ENV` — tags captured events with an `environment` property. Set it to
  `production` on the production deployment
- `REVENUECAT_WEBHOOK_SECRET` — shared bearer secret authenticating RevenueCat webhook posts.
  The route answers 500 when it is unset
- `REVENUECAT_API_KEY` — RevenueCat REST key used to re-read subscribers when reconciling a
  `TRANSFER`, refund, or `REFUND_REVERSED` webhook event. Refund reconciliation returns
  503 without this key so RevenueCat retries instead of leaving access silently out of sync
- `REVENUECAT_ENTITLEMENT_ID` — entitlement name read from the RevenueCat subscriber snapshot.
  Defaults to `Shelvr Pro`
- `SERPAPI_KEY` — SerpAPI key for `findProductLinks`. The search fails without it
- `RESEND_API_KEY` — Resend key for the waitlist contact projection. Without it, rows stay
  `unconfigured` and no attempt is spent
- `RESEND_SEGMENT_ID` — Resend segment for `shelvr` waitlist signups
- `RESEND_ANDROID_SEGMENT_ID` — Resend segment for `shelvr-android` signups. Android rows stay
  `unconfigured` until it is set
- `RESEND_TOPIC_ID` — Resend topic the contact is opted into

## Working conventions

- Do not reintroduce the old notes-app domain (`notes` table, OpenAI summary action, `/notes`
  routes). The product domain is **items + spaces**.
- Never pass `userId` from the client into Convex public functions.
- Keep `returns:` validators accurate — Convex enforces them at runtime.
- Prefer `withIndex` / search indexes over `.filter()` on growing tables.
- Public Convex functions are contracts with every app build in the wild, and the backend
  deploys independently of the app (`npx convex deploy` is manual; OTA updates land one launch
  later; store builds lag for weeks). Never change a public function's argument or return shape
  in the same release that moves the client. Expand first (add a new function or accept both
  shapes), deploy, move the client, then contract once the production update channel shows no
  old bundle still calling it. CI enforces the first half: `tools/verify-convex-api.mjs`
  resolves every public function's `args` and `returns` to their full text, following the
  shared validators they reference, and fails a pull request that changes or removes one.
  Acknowledge a change an installed app survives, or the expand half of the sequence, with
  a `Convex-Api: changed` trailer on a commit in the range. It cannot yet tell widening
  from narrowing, so an added field asks for the trailer too.
- Gate every save and Pro feature with `requireProEntitlement(ctx, userId)` from
  `subscriptions.ts`.
- Never log raw `console.*`: use `logEvent` (Convex), `serverLog` (web server), or
  `analytics.captureError` (native app) so events land in the Convex log stream or PostHog
  error tracking in a queryable shape. Keep messages, URLs, and user content out of log
  fields — log categories and codes instead.
- The classifier and recommendation passes may only create or remove `suggested` memberships in
  `spaceItems`. Purpose steering (`steerItemForSpace`) may update `intents` on `saved`
  memberships without changing their status. `saved` and `dismissed` statuses are user-owned, so
  no AI pass ever overwrites a user decision.
- Deploy backend changes in a compatible order: the Convex deploy lands before
  the client update that needs it (`.github/workflows/deploy.yml` enforces
  this: approved production deploy, then tester OTA). Breaking changes ship as
  expand/contract — deploy the tolerant version first, tighten once old
  clients are gone.
- An OTA update only reaches installs whose store build shares its native fingerprint. A
  change that moves the fingerprint (a new native module, a config plugin, `app.json`,
  `app.config.js`) strands every later OTA until a store build ships, and the diff does
  not say so. Two layers cover it. On a pull request CI runs
  `tools/verify-native-fingerprint.mjs --warn-only`, which names every source that moved
  and never fails the check; acknowledge an intended move with the
  `Native-Fingerprint: changed` trailer on a commit in the range. At publish time the OTA
  workflow's `before_update` hook runs `tools/verify-ota-compatibility.mjs`, which
  compares the fingerprint the update is about to carry against
  `apps/native/released-builds.json` and blocks the publish on anything but a match,
  including a profile or platform with no recorded release. A blocked publish means
  nothing published from this tree reaches the recorded binary, so the usual fix is a
  store build, and recording the release afterwards. See
  [push notification builds and updates](docs/architecture/push-notifications.md).
- Adding a field to a table is a one-way door once rows carry it. Convex validates
  every existing document against the new schema on deploy, and a table validator
  rejects a field it does not declare, failing with an "Unexpected field" error
  naming it. So reverting the commit that added the field fails the deploy instead
  of rolling it back. To back a field out, stop writing it and leave it declared
  `v.optional(...)`; drop the declaration only once no row still has it.
- Build Convex test harnesses with `newConvexTest()` from `convex/test.setup.ts`, never with a
  bare `convexTest(schema, ...)`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`apps/native/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `apps/native`.

<!-- convex-ai-end -->
