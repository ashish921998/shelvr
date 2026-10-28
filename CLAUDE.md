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

### Backend (`apps/native/convex/`), the source of truth

Convex is the reactive backend + database + file storage + AI orchestration. Auth is
[Convex Auth](https://labs.convex.dev/auth/) (`@convex-dev/auth`), configured in `convex/auth.ts`
and wired in `convex/auth.config.ts`. Convex Auth issues its own JWTs (signed with the
`JWT_PRIVATE_KEY` / `JWKS` deployment vars); the JWT `sub` contains the users-table id and session
id, and `model/auth.ts` extracts the stable users-table id used by every app table.

- **`schema.ts`**: the Convex Auth tables (`authTables`) plus these app tables:
  - `items`: saved links, images, and notes (`processing`, then `ready` or `failed`)
  - `spaces`: themed collections owned by a user
  - `spaceItems`: item/space membership join, with a `suggested` / `saved` / `dismissed` status
  - `itemOperations`: per-import idempotency ledger for image, link, and note saves
  - `subscriptions`: one Pro entitlement row per user, written by the RevenueCat webhook
  - `paymentAnalyticsReceipts`: seen payment event ids, so telemetry is not double counted
  - `notificationDevices`: one Expo push token per device, scoped to a user
  - `notificationPreferences`: weekly shelf opt-in, save reminder opt-out, timezone, and the
    next digest and reminder instants
  - `itemReads`: per-user read state, kept out of the item row
  - `placeVisits`: places the user marked "We went" on a plan, one row per place name, so
    later plans rank them last
  - `planShares`: a plan's shortlist snapshot behind a random public vote link (one week),
    so someone without the app can vote on its places at `/p/<token>`
  - `planVotes`: one visitor's ✓/✕ picks on a `planShares` link, keyed by a browser id,
    at most 20 voters per link
  - `trips`: one day-by-day trip per travel space ("Plan my trip"), every stop one of the
    user's saves; a new trip replaces the old one. Old builds only; new trips are `tripPlans`
  - `tripPlans`: one planned trip ("Plan a trip" v2) for a city: days, pace, interests,
    optional start date and stay, plus stop and saved counts. Every new plan is a new row
  - `tripStops`: one stop of a `tripPlans` trip, on day 1..dayCount or day 0 (unplanned),
    from a save (`itemId`) or an Apple Maps suggestion, carrying its own name, pin, Apple id
    and category. Deleting the save keeps the stop; a trip read opens only live saves
  - `shareLinks`: one random public token per shared item, the capability behind the
    branded preview page (`createShareLink`, `getSharePreview`, `/share/links/`)
  - `weeklyDigests`: the persisted weekly shelf and its delivery state
  - `saveReminders`: one push naming one save (an unread article or a recipe),
    with its delivery state; also the reminder budget's memory
  - `waitlistSignups`: waitlist source of truth, projected to Resend
  - `feedbackSubmissions`: in-app feedback source of truth, projected to the Resend support inbox
    (see [feedback delivery](docs/architecture/feedback.md))
  - `legalConsents`: versioned terms acceptance and the refund-data sharing choice
    (see [refund consent](docs/architecture/refund-consent.md))
  - `cancelSurveys`: one next-visit cancel-survey ask per user; the first recorded outcome wins
  - `captureTokens`: hashed per-device tokens the iOS App Intents use in place of a JWT
  - `onboardingDemos`: the one pre-payment demo save each user is allowed
  - `aiConsents`: one row per user holding their answer to the third-party AI processing
    disclosure (`granted` or `declined`) and the disclosure version it answered
  - `appleTokens`: the latest Sign in with Apple refresh token per user, kept only to
    revoke it on account deletion; never returned to a client or logged
  - `detachedAppleTokens`: a web-flow Apple refresh token that arrived while its owner was
    already `deleting`, parked only until `revokeDetachedToken` has revoked it, so no
    scheduled job argument ever carries a token

  `schema.ts` also redeclares Convex Auth's `users` table with two optional fields.
  `appleRefreshToken`: Convex Auth writes the Apple profile onto that row, and
  `keepAppleRefreshToken` (`model/appleTokens.ts`) moves the token to `appleTokens` in the
  same transaction, so no stored users row carries it. `deleting`: a one-way marker
  `deleteCurrentUserAccount` sets in its first transaction, so the account stops owning
  data before the batched cleanup finishes. `liveOwner` (`model/auth.ts`)
  is the one definition of an account that may still own data (row present, `deleting`
  unset), used by `requireUserId`, `getCurrentUser`, the capture-token, Apple-token and
  billing writes, and `canResetCurrentUser`. The marker is never cleared; the cleanup
  deletes the row. It stays declared `v.optional(...)` through any rollback while a row
  still carries it (see the one-way-door rule under Working conventions).

  `items` has `by_user`, `by_user_and_type`, and `by_storage` indexes plus a `search_text`
  full-text search index (filtered by `userId`).

- **`items.ts`**: public queries `listItems`, `getItem`, `searchItems`, `similarItems`,
  `photoUsage`, `getImportOperation`, and `listCities` / `listCityItems` (the cities Home
  lists and one city's ready saves, newest first, which the city page shows; `readyCitySaves`
  is the shared helper).
  Home searches the caller's saved titles, cities and place names through `searchItems`,
  using the existing account-filtered full-text index (at most 50 matches, with an
  inline notice asking for a narrower search when that limit is reached). Mapped
  pin names are indexed too, including pins sourced from Maps intents; storing
  pins refreshes search text in the same transaction.
  Its response includes optional `places` so unpinned matches can show their place
  names; older clients can ignore the field. Query terms are split on punctuation
  as well as whitespace and capped at 16 before searching. After
  deploying the city/place search change, run from `apps/native`:
  `pnpm exec convex run --prod items:backfillPlaceSearch '{"cursor":null}'`.
  This internal, paginated repair updates only search text for live owners, schedules
  its remaining pages, and is safe to restart. Deploy and finish it before releasing
  the search UI so older saves match cities and places too.
  `listCities.count` retains the legacy save count for installed apps; optional
  `placeCount` is the distinct mapped-place count for that city.
  City reads filter pins by their resolved city; legacy unlabelled pins are shown only for single-city saves. New clients hide an absent or
  zero place count while retaining the city and its saves.
  Image saves run a three-step, idempotent import: `beginImageImport`, then
  `attachImageUpload`, then `finalizeImageImport`, all keyed on a
  client-generated `operationId` in `itemOperations`.
  The returned upload URL now targets `/image-upload`, which claims a single
  receiver, caps the streamed body at the image limit, and records its storage ID
  before replying. Begin and upload budgets, pending-operation reservations,
  stale-operation cleanup, and a paginated orphan-storage sweep bound abandoned
  work. Successful upload retries return the same storage ID.
  Other public mutations are
  `createLinkItem`, `createNoteItem`, `findLinks` (user-triggered product search),
  `reprocessItem` (retry a failed or partially enriched save), `deleteItem`, and the share
  link pair `createShareLink` / `settleShareLink` (a cancelled share sheet withdraws a
  fresh, never-confirmed link). The rest of the
  file is internal helpers the AI action calls (`finalizeItem`, `failItem`, `setSpacesForItem`,
  `suggestItemsForSpace`, `cleanupStaleImageImports`, and others). `enrichItem` resolves
  `storageId` to an `imageUrl` at read time.
- **`spaces.ts`**: public space CRUD (`listSpaces`, `getSpace`, `createSpace`, `updateSpace`,
  `deleteSpace`), `getSpaceCards` (a space's saved items as card rows, which the plan and trip
  pages read), membership writes (`addItemToSpace`, `removeItemFromSpace`), and the
  suggestion decisions (`acceptSuggestion`, `undoAcceptSuggestion`, `dismissSuggestion`,
  `acceptAllSuggestions`), `ensureCitySpace`, plus internal join helpers. `ensureCitySpace`
  finds or makes a hidden space named for a city and files that city's ready saves into it
  as `saved`; older builds call it before Plan a date (the current one opens `date-plan`,
  which needs no space), and plan shares and stored trips hang off that space. The app no longer shows spaces; the CRUD and suggestion
  functions stay for old builds.
- **`subscriptions.ts`**: `getEntitlement` query for the client and the
  `requireProEntitlement(ctx, userId)` helper that gates every save and Pro feature. The
  `upsertSubscription`, `liveOwners`, and `applySnapshots` internals are driven by the
  RevenueCat webhook.
- **`aiConsent.ts`**: legacy AI preferences and ownership checks. `getStatus` and
  `setConsent` remain compatible with installed clients. Every path sending content to
  Gemini, SerpAPI or Treg checks `aiAllowed` / `isAllowed`: missing or deleting owners,
  missing or unowned saves, and explicit legacy declines are refused. Accounts with no
  preference record use AI automatically; no grant record is fabricated. The current
  client has no AI consent screen, prompt or Settings switch. Legacy `getStatus` still
  reports `unset` for an unanswered account, so old clients retain their existing UI.
  A declined user's saves still finish `ready` from what Shelvr read itself, without AI.
  `model/aiConsent.ts` retains `AI_CONSENT_VERSION` and the `ai_consent_required` error.
  `spaces.ts` owns `recommendationContext` (space, permission and membership exclusions)
  and `survivingCandidates` (up to 100 candidate saves, loaded and checked again before
  classification). These checks run before a request goes out. They cannot
  cancel or recall a request already sent, because a database check and an external provider
  call cannot share a transaction.
- **`appleRevoke.ts`** (`"use node"` action): revokes a Sign in with Apple refresh token
  after `deleteCurrentUserAccount` hands it over. Best effort: it never throws, skips with
  one log line when the `APPLE_REVOKE_*` variables are unset, and retries only when Apple
  could not be reached. A token from the native sheet (traded for the sheet's code in
  `auth.ts`, via `model/appleClient.ts`) carries the bundle id it was issued to as
  `clientId`, and is revoked as that client instead of the web Service ID. A web-flow
  sign-in that lands while the owner row is already `deleting` cannot store its token, so
  `keepAppleRefreshToken` parks it in `detachedAppleTokens` and schedules
  `revokeDetachedToken` with the row id under the same policy instead of dropping it; the
  job deletes the row on every terminal outcome. A `forgetDetachedAppleToken` call
  scheduled an hour out deletes the row if the job died. If the deletion lands after the
  native sheet's code is exchanged but before the token is stored, `auth.ts` checks the new
  token belongs to that user and revokes it at once through the shared `model/appleClient.ts`
  request. It makes one attempt, stores nothing and schedules nothing; a stored token keeps
  its retries.
- **`legalConsent.ts`**, **`legalConsentSync.ts`**: versioned terms acceptance and optional
  Apple refund-data sharing, delivered to RevenueCat with retries. See
  [refund consent](docs/architecture/refund-consent.md) for policy and rollout requirements.
- **`notifications.ts`**: push, weekly shelf and save reminder API, with `getPreferences`,
  `setPreferences`, `setSaveReminders`, `registerDevice`, `unregisterDevice`, `markItemOpened`,
  `getDigest`, and `markDigestOpened`, plus internal digest and reminder preparation.
  `notificationDelivery.ts` holds the claim/finish/recover delivery machine for both, and
  `model/saveReminders.ts` the reminder rules. See
  [contextual notifications](docs/architecture/contextual-notifications.md).
- **`waitlist.ts`**: the public `join` action the web marketing site calls, plus the internal
  Resend projection and its bounded retry.
- **`feedback.ts`**: the public `submitFeedback` mutation (persist-first), plus the internal
  claim/finish delivery machine that projects each submission to the Resend support inbox with an
  hourly bounded retry. See [feedback delivery](docs/architecture/feedback.md).
- **`http.ts`**: Convex Auth HTTP routes (`auth.addHttpRoutes`), the RevenueCat webhook at
  `/webhooks/revenuecat` (authenticated with the `REVENUECAT_WEBHOOK_SECRET` bearer secret),
  the waitlist receiver at `/waitlist/join`, the web Oracle at `/oracle`, the App Intents
  capture routes under `/app-intents/`, Apple's Get Retention Message endpoint at
  `/retention-messaging` (authenticated by the App Store's JWS signature, checked in
  `model/appleJws.ts`), and `GET /health` (200/503 probe for uptime
  monitors, backed by the `health.ts` `ping` query).
- **`crons.ts`**: refund consent sync retry, stale image import cleanup, stale processing-item
  failure, waitlist Resend retry, weekly shelf and save reminder preparation, their delivery
  recovery, hourly feedback inbox delivery retry, daily payment-receipt
  retention purge, and the daily expired plan vote link purge.
- **`auth.ts`**: `convexAuth()` setup with Google + Apple OAuth (Auth.js providers) and an optional
  Anonymous provider (dev only, gated on `AUTH_ENABLE_ANONYMOUS`). `appleProfile.ts` drops the
  `image: null` Apple's provider emits, which the users schema rejects.
- **`users.ts`**: `getCurrentUser` query, used by the client for email display and RevenueCat
  identity sync (null once deletion has begun), plus `deleteCurrentUserAccount` and its batched
  internal deletion. Deletion is idempotent: the first call marks the row `deleting`, revokes
  the Apple token and starts the cleanup; a repeat resumes the cleanup without a second revoke
  job; a call after the row is gone is a no-op.
- **`devFixtures.ts`**: `canResetCurrentUser` / `resetCurrentUser`. Both are inert unless
  `AUTH_ENABLE_ANONYMOUS` is `"true"` and the caller is a development anonymous user.
- **`analytics.ts`**, **`accountTelemetry.ts`**, **`paymentTelemetry.ts`**: server-side PostHog
  capture. Every one is a no-op when `POSTHOG_PROJECT_TOKEN` is unset.
- **`ai.ts`** (`"use node"` action): the processing pipeline. On create, a mutation inserts the
  item as `status: "processing"` and schedules `internal.ai.processItem`. That action: for links,
  calls `readPage(url)` from `model/pageRead.ts`, which returns the article body, metadata and
  hero image; for notes it feeds the content to the model; for images it sends the stored bytes
  as a file part. It calls `generateObject` (Vercel AI SDK, Zod schema) to produce
  title/description/tags/spaceNames/intents, maps space names back to ids, then `finalizeItem`
  flips status to `ready`. Only spaces marked `dynamic` are visible to the classifier, and its
  matches become `suggested` memberships (`saved` in a space set to auto-file). The model
  also lists every place a save names into `items.places`. `enrichItem` strips it
  from general item reads; `searchItems` explicitly returns it as an optional field
  so unpinned matches can show their names. Plans and trips read it through
  `toPlanSource`. A short video's speech is read once
  through Treg (`model/videoTranscript.ts`) when the model flags it as a cooking video whose
  caption and linked page gave no recipe, or as a video that recommends or visits places;
  a second call then lifts the recipe, the spoken places, or both. The file also holds
  `steerItemForSpace` (per-space intents, scheduled
  when an item is filed into a space), `findProductLinks` (SerpAPI Google Shopping, needs
  `SERPAPI_KEY`). Old sweep and recommendation exports forward queued jobs across deploys.
- **`aiEmbeddingSweep.ts`** (`"use node"`): retired. Saves no longer get embeddings, because
  nothing the app shows read them, and each one made every save about 16 KB heavier in
  the city scan's read budget. Its cron is gone; the action is a no-op kept so a queued
  sweep ends quietly. `items:clearEmbeddings` removes old vectors; run it once after
  deploying, from `apps/native`: `pnpm exec convex run --prod items:clearEmbeddings '{"cursor":null}'`.
  It schedules its remaining pages and is safe to rerun. `items.embedding`,
  `embeddingVersion` and `embeddingAttempts` stay declared until no row carries them.
  See [embeddings](docs/architecture/embeddings.md).
- **`aiRecommendForSpace.ts`** (`"use node"`): recommendations from the 100 newest ready
  saves, scheduled by space creation and dynamic enabling (old builds only); creates
  suggestions only.
  It and `ai.ts` share model setup and deadlines in `model/aiProvider.ts`.
- **`model/pageRead.ts`**: the single `readPage(url)` entry point and host dispatcher.
  **`model/pageReadCore.ts`** holds shared page data, bounded fetches, HTML extraction
  (Mozilla **Readability** via `linkedom`) and schema.org recipe helpers.
  **`model/readers/youtube.ts`**, **`model/readers/x.ts`**, **`model/readers/instagram.ts`**,
  **`model/readers/pinterest.ts`** and **`model/readers/tiktok.ts`** own each platform's
  reader and fallback. Full YouTube descriptions and verified Instagram captions follow linked
  recipe markup first, then the existing complete-caption recipe path.
  **`model/readers/googleMaps.ts`** reads a shared Google Maps list (a `maps.app.goo.gl`
  share link or a `/maps/placelists/list/` URL) through Google's undocumented public list
  endpoint, the one its own list page calls; Google offers no API for lists, so a format
  change breaks it and the save falls back to a plain page read. A private or deleted list
  reads as gone. Other Google Maps links read as pages. The list's places (name, note,
  address, point, at most 150) ride on `PageData.placeList`; `ai.ts` asks the model for
  each place's city once and `model/placeList.ts` (pure) splits the list into one save per
  city, at most 30 places each, biggest city first. The save itself
  becomes the first part and `items.addPlaceListParts` inserts the rest as ready saves
  (skipping a part whose title that link already has). Every listed place is pinned at the
  list's own point (`items.pinListPlaces` before the save settles, so the Apple lookup finds
  it pinned); `placePins.identifyPins` then adds Apple's place id and category only from a
  match within 300 m, never moving the pin. A manual `backfillPage` refresh still re-looks
  up a list pin that has no category.
  Host-specific knowledge stays in the page readers, never in `ai.ts`.
- **`model/safeFetch.ts`**, **`model/externalUrl.ts`**: every backend fetch of an external URL
  goes through `safeFetch` (SSRF and resource-exhaustion defence, redirect and size limits).
  `externalUrl.ts` is the runtime-agnostic URL policy and host detection (`linkSource`,
  `isInstagramUrl`, `isPinterestHost`), usable from mutations as well as Node actions.
- **`appIntents.ts`**: saves from the iOS App Intents (Siri, Shortcuts), which run without the
  JavaScript app and so have no JWT. The app mints a per-device capture token
  (`issueCaptureToken`, `revokeCaptureToken`); the `/app-intents/*` HTTP routes resolve it to a
  user and run the same save helpers, gates and limits as the app's own mutations.
- **`plans.ts`** (`"use node"` action): "Make a plan". `makePlan` takes a space and an
  optional `city`. With a city it reads that city's ready saves; otherwise it reads saved
  space memberships. `spaces.claimPlanInternal` enforces ownership, Pro and the rate
  limit, then looks up each candidate's visit status using an index (no recent-visit cap).
  `model/plan.ts` deduplicates and shuffles already-extracted places, returning at most
  five with text from their source save. Street-address-only labels are excluded from
  recommendations (saved pins remain intact). Alias merging requires the same saved map
  point plus compatible name/type evidence; unlocated or conflicting aliases stay separate.
  No AI call or AI permission is needed to plan.
  "We went" places never return as fallback picks. A multi-city save contributes only
  place labels explicitly carrying the chosen city; ambiguous labels are skipped.
- **`datePlans.ts`** (`"use node"` action), **`datePlanData.ts`**: "Plan a date". `makeDatePlan`
  takes a city and a kind (`classic`: dinner, then drinks or dessert; `lowkey`: coffee, then a
  walk; `surprise`: one the saves can make) and returns ranked evenings of two stops a walk
  (1.5 km) apart, at least one of them a saved, pinned, unvisited place. `claimDatePlanInternal`
  checks Pro and spends the `makePlan` rate limit before reading the city's saves. The pure
  rules (which category or tag fits which stop, pair ranking, Apple result filters) are in
  `model/dateRank.ts`; the result shape and the swap rule the app shares are in
  `model/datePlan.ts`. With fewer than three evenings from the saves alone, it asks Apple Maps
  for the missing stop near up to three saved ones (one search each, 10 s deadline, none when
  AI is declined or the Maps key is unset). Nothing is stored; the app shows the best evening and changes a
  stop on the phone.
- **`mapPlaces.ts`**: `listMapPlaces`, every mapped place across the caller's ready saves
  (newest first, one entry per spot) for the Map tab, each with its filter kinds from
  `model/placeKinds.ts`: Apple's point-of-interest category when the pin has one, otherwise
  the save's tags; "date night" always comes from the tags.
- **`placeVisits.ts`**: `setVisited` records or removes a user's "We went" mark. Planning
  and trip swaps check these records inside Shelvr; they are not sent to an AI provider.
- **`planShares.ts`**: "Ask someone" on a plan. `createPlanShare` stores the plan as a vote
  link and `latestPlanShare` reads its tallies back; the public `/plan/shares/` and
  `/plan/votes` HTTP routes (votes behind the waitlist secret and a per-IP limit) serve the
  web page at `apps/web/src/app/p`. Links and votes go with their space or account, and a
  daily cron deletes them a week after they close.
- **`trips.ts`** (`"use node"` action), **`tripData.ts`**: "Plan my trip". `makeTrip` reads
  the chosen city's ready saves (or the most common city in a space), shuffles stored
  unvisited place names, resolves missing pins with Apple Maps (`model/appleMaps.ts`),
  and groups nearby stops into days at the selected pace (`model/trip.ts`, pure).
  It does not send saves or visit history to Gemini or infer new places from raw text.
  Without a stored time-of-day category, stops use the existing "any"/afternoon slot;
  the app shows neither that slot nor the lunch and dinner gaps, since neither is known. An empty selection leaves the previous trip intact.
  `tripData.ts` stores the trip and serves `getSpaceTrip` / `tripCities`; swaps also skip
  wishlist places marked visited after the trip was made. Explicit non-saved memberships
  are excluded from selection, display and swaps. Stored city-less stops still use their
  saved membership to remain visible, while city-matching saves need no membership row.
  Without the Maps key, trips
  still work using stored pins where available.
- **`tripPlanner.ts`** (`"use node"` action), **`tripPlannerData.ts`**: "Plan a trip" v2.
  `createTripPlan` (Pro only, `createTripPlan` rate limit) puts the city's unvisited, pinned
  saves first, then adds suggestions from the Apple Maps Server API only (`/v1/search` with
  `resultTypeFilter=Poi` and `includePoiCategories` per interest, from the centre and four
  offset points; no Gemini or other source), with queries from the saves' own tags. With AI
  declined it makes no Apple call at all and plans from stored pins. Chains, lodging, results
  over 25 km from the centre, visited places and namesakes are dropped, and a trip makes at
  most 24 Apple requests. The
  pure rules (category map, queries, filters, balancing, day layout) are in
  `model/tripSuggest.ts`; `model/appleMaps.ts` `appleMapsSearchPlaces` is the search.
  Without the Maps key it plans from saves only. `tripPlannerData.ts` serves
  `listTripPlans`, `getTripPlan` and `deleteTripPlan`, plus `claimTripPlanInternal` and
  `saveTripPlanInternal`. `trips.ts` and `tripData.ts` stay for installed builds.
- **`placePins.ts`**: `placePins` on a save, the coordinates of the places it names, which the
  city page's map pins. `locateItem` looks up in Apple Maps the places read off the save
  (`items.places`) first, then its `open_maps` intent values (the save's own and its spaces'),
  and `storePins` writes at most 30, dropping any place no longer named.
  Each pin also keeps Apple's place id (`appleId`) and point-of-interest `category` when the
  search result carried them; the Map tab's filters read the category.
  Every pin on a single-city save keeps its source city, including suburbs. For multi-city saves,
  Apple locality is used only when it matches a source-declared city; unmatched pins remain unassigned.
  Multi-city lookups keep explicit city qualifiers instead of using the first city as a bias.
  Only source cities can disable single-city outlier rejection; returned localities cannot.
  Pin lookup never expands `items.cities`; Home creates entries for the cities extracted from the source (up to 30). Scheduled from
  `finalizeItem` when a finished save has places or a Maps intent, from steering, and when a
  membership carrying a Maps intent is removed or dismissed; `backfillPage` refreshes older pins with no city or no category, run by hand after deployment:
  `pnpm exec convex run --prod placePins:backfillPage '{"cursor":null}'` from `apps/native`. Skipped
  when AI is declined or the Maps key is unset.
- **`demo.ts`**: the pre-payment onboarding demo save (`createDemoItem`, `retryDemoItem`), one
  per user, tracked in `onboardingDemos`. Onboarding no longer has a first-save step; the
  app still calls `createDemoItem` for a first save an older build queued before sign-in.
- **`cancelSurvey.ts`**: the next-visit cancel survey (`getStatus`, `markShown`, `respond`); the
  client boundary is `src/lib/cancel-survey.ts`.
- **`reelPlaces.ts`** (`"use node"` action): the web reel place finder. The internal `find`
  action reads one public Instagram or TikTok link with `readPage`, asks the model for the
  places its caption names, and drops any the text never mentions (`model/reelPlaces.ts`).
  Nothing is stored. Reached only through the `/reel-places` HTTP route, which
  `apps/web/src/app/api/reel-places` calls; `oracleLimits.claimReelPlaces` is its rate limit.
- **`oracle.ts`**, **`oracleLimits.ts`**: the web Oracle. The internal `consult` action reads
  pages and makes one model call inside the web route's deadline; `claim` is its rate limit.
  Reached only through the `/oracle` HTTP route, which `apps/web/src/app/api/oracle` calls.
- **`model/auth.ts`**: `requireUserId(ctx)` returns the stable Convex Auth users-table id (not the
  session-bearing JWT `sub`). **Every public function derives `userId` from this, never from a client
  argument.** A public query or mutation gets it through `authedQuery` or `authedMutation`, which
  run `requireUserId` before the handler and pass the id as `ctx.userId`. The few that must answer
  a caller with no live account skip the builders and are listed, each with a reason, in
  `PUBLIC_ON_PURPOSE` (`model/publicFunctions.ts`). `model/publicFunctions.test.ts` fails on any
  public query or mutation that is neither built nor listed, and calls every built one as a
  signed-out caller and as a deleting account, failing unless it throws "Not authenticated"
  before the handler runs. So a function moved onto the builders adds no refusal test of its own.
  `.github/CODEOWNERS` names the owner for the list.
  Public actions have no builder yet; an action derives the caller through the internal
  mutation or query it runs (as `issueCaptureToken` does through `storeCaptureToken`), so
  authorization and the write stay in one transaction.
- **`model/log.ts`**: `logEvent(level, event, fields)` structured logging, one JSON line per event
  into the Convex log stream, scalar fields only. All backend logging goes through it (ESLint
  `no-console` enforces this).
- **`model/settlement.ts`**: `completionPatch(item, run, aiAllowed)`, the pure rule for what a
  finished processing run writes to a save. `run` holds the run's `reading` (what Shelvr read
  itself) and, when the model was consulted, its `classification`; `runFields` are
  `finalizeItem`'s arguments. With AI declined, whether the owner
  declined before the run asked or while it ran, the classification is ignored and the save settles
  from the reading alone: the page's title, description and recipe, or a note's first line, plus the
  save's own tags, intents and cities. A recipe the save already has stays when the page offers none.
  A typed or refreshed title wins. A vector lands only while AI is allowed (consent not declined)
  and only if the text it was computed from is the text the save settles to (`embeddingText`);
  otherwise the stamp and attempts clear and the sweep embeds the save again. `finalizeItem` is its
  adapter (run fence, consent read, poster cleanup, telemetry).
  `finalizeItem.grid.test.ts` replays every scenario through the real mutation and
  `model/settlement.test.ts` through the pure function, both against `testdata/settlement/rows.json`.
  Re-record that file only for a change you intend, and review its diff.
  A run that fails writes `failurePatch(reason)` from the same module: only the status and
  reason, so the save keeps what earlier runs gave it. A save the run already settled ready
  stays ready, and `failItem` answers `settled`. `failItem` and the stale-processing cron are
  its adapters, and `failItem.test.ts` tests them directly.

**The AI model** is `gemini-3.1-flash-lite`, called directly through the `@ai-sdk/google` provider
(auth via the `GOOGLE_GENERATIVE_AI_API_KEY` Convex deployment env var, an AI Studio API key).

When editing anything in `convex/`, prefer the `convex-expert` skill. It covers object-form syntax,
`args` + `returns` validators on every function, and index-backed reads only.

### Web (`apps/web`)

- Next.js App Router marketing site only (no auth or product UI); server routes may call Convex
  for marketing forms such as platform waitlists
- Landing page at `/`. The product experience lives in the native app
- Free tool pages for search traffic, each with one App Store button: `/reel-place-finder`
  takes a pasted Instagram reel or TikTok link and lists the places its caption names, with
  Apple Maps and Google Maps links (`src/lib/reelPlaces.ts`). It posts to `/api/reel-places`,
  which forwards to the Convex `/reel-places` route (`reelPlaces.ts`, the same shared-secret
  and per-IP limits as the Oracle) and stores nothing

### Native (`apps/native`)

- The current onboarding share demo always uses a real reel: `src/lib/aha-sample.ts`
  picks the selected city and goal's reel, or Austin for that goal when no reel exists.
  Completion queues that exact URL; `useReplayOnboarding` saves it through
  `createLinkItem` once signed in with Pro, and normal reading and Maps lookup
  populate Home. The selected city answer stays separate from the sample city.
- UI localization uses `expo-localization` and the in-house `translate` in `src/lib/i18n-core.ts`,
  which falls back from the locale to its language to English, fills `%{name}` placeholders, and
  picks plural forms with the CLDR rules in `convex/model/localization.ts`. Read
  [`docs/architecture/localization.md`](docs/architecture/localization.md) before adding visible copy;
  update all catalogs and run `pnpm localization:generate` after translation changes. It is a
  root script, so run it from the repo root. It writes `src/locales/catalogs.ts`,
  `src/locales/message-types.ts` and `convex/model/notificationTranslations.json`; never edit
  those by hand.
- Design tokens live in `src/unistyles.ts` (type, spacing, color, controls) and motion in
  `src/lib/motion.ts`. Read [design system](docs/architecture/design-system.md) before adding
  UI, and [display font](docs/architecture/display-font.md) before touching the title face.
- To run a branch or worktree on a simulator (Metro port, dev client link, sign-in, fixtures,
  forcing onboarding or the paywall), read [local QA](docs/architecture/local-qa.md) first.
- Expo Router under `src/app`, with `(auth)` and `(app)` groups
- Convex Auth via `ConvexAuthProvider` (`@convex-dev/auth/react`) in `src/app/_layout.tsx`,
  backed by `expo-secure-store` token storage; `useConvexAuth()` (from `convex/react`) guards the
  `(auth)` / `(app)` route groups
- `(app)/(tabs)` holds three native tabs, `(home)`, `(map)` and `(trips)`. `(trips)` is
  "My trips", the person's trip plans newest first, each opening `trip-plan/[id]`, with
  Plan a trip in the header and the empty state. `(map)` is every mapped place on
  one full-screen map, opening on the person's location (iOS asks once, when the tab first opens)
  unless none of their places is within 50 km; otherwise on the city with the most places, with a search field over your own places (name or city, matched on the phone) and filter chips
  for the kinds that have three or more places (`src/lib/map-filters.ts`); tapping a place opens Apple's place card, or the save without one.
  `(home)` is Home. It lists "Your cities" and
  "Finding places…" for processing saves. Failed reads and finished saves without a city
  sit behind one "N saves without a place · Review" line, whose sheet has Retry and Delete
  (`src/components/home/review-saves.tsx`); a save that lands that way while the app is open
  shows a toast instead (`unplaced-toast.tsx`). It loads more saves on scroll, and on its own only
  until five unplaced saves are loaded, never past 200. Old deep links, pushes and Siri
  shortcuts to removed screens (spaces, search, digest, camera, the old trip) open Home, through
  `src/lib/home-href.ts` and `src/app/+native-intent.ts`
- `city/[name]` is the city page: a map and numbered rows for distinct places from the
  city's saves, plus a row for every save not represented by a place row, with Plan a date
  and Plan a trip. A selected place row shows an info button that opens Apple's place card
  (iOS 18+, `modules/apple-place-card`, needs the pin's `appleId`); tapping the row opens the save
- Other `(app)` routes: `add` (a pasted link only), `share`, `onboarding`, `paywall`, `plan-gate`,
  `profile`, `settings`, `item/[id]`, `city/[name]`, `plan/[id]`, `date-plan`, `new-trip`,
  `trip-plan/[id]`
- `date-plan` is Plan a date, pushed from the city page with a `city` param: "What kind of
  date?" (Classic, Low-key, Surprise me),
  then the evening from `makeDatePlan`: both stops on a map, a card each with Hours and info
  and Change (only when another nearby stop fits), the approximate walk between, Send to your
  date (plain share text with Maps links) and Directions to stop 1 (Maps directions)
- `new-trip` is the trip planner form, a modal with an optional `city` param (the city page's
  Plan a trip opens it): city, days, optional start date, interests, pace and an optional
  stay. It checks Pro on submit, calls `createTripPlan` behind a three-step reveal, then
  replaces itself with `trip-plan/[id]`
- `trip-plan/[id]` is a planned trip: a map of the stops (tap a day to focus it), then day by
  day stops badged Yours or Suggested and an unplanned section. A save opens `item/[id]`, a
  suggestion opens Apple's place card or Maps by coordinates; the header menu deletes it.
  The old `trip/[id]` screen is gone and its links open Home; `trips.ts` and `tripData.ts`
  stay for installed builds
- `plan-gate` is the hard paywall: a signed-in account past onboarding without an active
  entitlement sees it instead of every other route except `profile`, `settings` and `paywall`
- `(auth)` holds a single `sign-in` route
- Scheme: `shelvr`. Bundle id: `app.shelvr.save` in production. `app.config.js` appends `.dev`
  or `.preview` for the other `APP_VARIANT` build profiles, so a dev install never collides
  with the App Store install

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
  `TRANSFER`, `BILLING_ISSUE`, refund, or `REFUND_REVERSED` webhook event. Billing-issue and refund reconciliation return
  503 without this key so RevenueCat retries instead of leaving access silently out of sync
- `REVENUECAT_ENTITLEMENT_ID`: entitlement name read from the RevenueCat subscriber snapshot.
  Defaults to `Shelvr Pro`
- `SAVE_REMINDERS_ENABLED`: save reminders send only while this is `"true"`. Unset by
  default, so a deploy never starts them; set it back to anything else to stop them, queued
  ones included, without a deploy. See
  [contextual notifications](docs/architecture/contextual-notifications.md)
- `SERPAPI_KEY`: SerpAPI key for `findProductLinks`. The search fails without it
- `YOUTUBE_API_KEY` — optional YouTube Data API v3 key for video descriptions and metadata.
  Missing key, quota/auth rejection, network failure or unusable responses preserve the existing
  oEmbed fallback; oEmbed-only metadata never enables caption recipe extraction.
- `TREG_API_KEY` / `VIDEO_TRANSCRIPTS_ENABLED`: Treg token for the spoken transcript of a
  cooking TikTok or reel whose caption has no recipe, or one that recommends or visits places
  (`model/videoTranscript.ts`, about $0.002
  each, rate limited per user and globally). Transcripts are fetched only while the switch is
  `"true"` and the key is set; set the switch to anything else to stop them with no deploy
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
- Gate every save and Pro feature with `requireProEntitlement(ctx, userId)` from
  `subscriptions.ts`.
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
- Deploy backend changes in a compatible order: the Convex deploy lands before
  the client update that needs it. `.github/workflows/deploy.yml` deploys the
  backend alone, and `.github/workflows/release.yml` deploys the selected
  commit's backend before it builds or publishes anything, so no client reaches
  a person ahead of the functions it calls. Breaking changes ship as
  expand/contract: deploy the tolerant version first, tighten once old
  clients are gone.
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
