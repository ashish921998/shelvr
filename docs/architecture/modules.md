# Architecture reference

The module-by-module detail behind the index in `CLAUDE.md`. `CLAUDE.md` names every table,
module and route; read the matching entry here before changing one. When behaviour changes,
update the entry here, not `CLAUDE.md`.

## Backend (`apps/native/convex/`), the source of truth

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
  - `placeRemovals`: user-owned venue removal decisions, indexed by user; the account deletion drain removes them in batches through `deletePlaceRemovalsBatch`
  - `placeVisits`: places the user marked "We went" on a plan, one row per place name, so
    later plans rank them last
  - `planShares`: a plan's shortlist snapshot behind a random public vote link (one week),
    so someone without the app can vote on its places at `/p/<token>`
  - `planVotes`: one visitor's ✓/✕ picks on a `planShares` link, keyed by a browser id,
    at most 20 voters per link
  - `trips`: one day-by-day trip per travel space ("Plan my trip"), every stop one of the
    user's saves; a new trip replaces the old one. Old builds only; new trips are `tripPlans`
  - `tripPlans`: one planned trip ("Plan a trip" v2) for a city: days, pace, interests,
    optional start date (indexed by `by_start_date` for the trip eve sweep) and stay, plus stop and saved counts. Every new plan is a new row.
    Optional `listId` says the trip was planned from a shared list (provenance, one-way
    door, stays `v.optional`); the trip itself stays personal to the person who made it
  - `tripStops`: one stop of a `tripPlans` trip, on day 1..dayCount or day 0 (unplanned),
    from a save (`itemId`), an Apple Maps suggestion or a place found with Add a place, carrying its own name, pin, Apple id
    and category. Deleting the save keeps the stop; a trip read opens only live saves
  - `sharedLists`: one list of places two people keep together: its owner (`ownerId`, a
    users id), name, the `cities` chosen at creation, the random `inviteToken` behind its
    join link, and a `placeCount`
  - `sharedListMembers`: one row per person on a `sharedLists` list, the owner included,
    with `joinedAt` and the `seenAt` that decides which places are new to them. At most
    8 members a list and 20 lists a person
  - `sharedListPlaces`: one copied place on a `sharedLists` list, modelled on `tripStops`:
    its own name, pin, required city, Apple id, category and tags (copied only when the
    save names one place), who added it (`addedBy`), the
    save it came from (`itemId`, returned only to that person) and `visitedAt`. No save
    title or text is copied, and a row outlives the save. At most 200 a list
  - `shareLinks`: one random public token per shared item, the capability behind the
    branded preview page (`createShareLink`, `getSharePreview`, `/share/links/`)
  - `weeklyDigests`: the persisted weekly shelf and its delivery state
  - `saveReminders`: one push naming one save (a place not yet visited, an unread article or a recipe),
    with its delivery state; also the reminder budget's memory
  - `tripEveReminders`: one push the evening before a dated trip, one row per trip (`by_trip`),
    with the same delivery state as `saveReminders`. Rows outlive a deleted trip so the claim
    can close them; keep the table declared on rollback once rows exist
  - `waitlistSignups`: waitlist source of truth, projected to Resend
  - `feedbackSubmissions`: in-app feedback source of truth, projected to the Resend support inbox
    (see [feedback delivery](feedback.md))
  - `legalConsents`: versioned terms acceptance and the refund-data sharing choice
    (see [refund consent](refund-consent.md))
  - `cancelSurveys`: one next-visit cancel-survey ask per user; the first recorded outcome wins
  - `captureTokens`: hashed per-device tokens the iOS App Intents use in place of a JWT
  - `onboardingDemos`: the one pre-payment demo save each user is allowed
  - `freeSaves`: one row per link or note save made without Pro while `FREE_SAVES_ENABLED`
    is on, `pending` until it settles, then `placed` (counts toward the 10) or `released`
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
  still carries it (see the one-way-door rule under Working conventions in `CLAUDE.md`).

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
  `requireProEntitlement(ctx, userId)` helper that gates Pro features and photo saves. The
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
  [refund consent](refund-consent.md) for policy and rollout requirements.
- **`notifications.ts`**: push, weekly shelf and save reminder API, with `getPreferences`,
  `setPreferences`, `setSaveReminders`, `registerDevice`, `unregisterDevice`, `markItemOpened`,
  `getDigest`, and `markDigestOpened`, plus internal digest and reminder preparation.
  `notificationDelivery.ts` holds the claim/finish/recover delivery machine for both, and
  `model/saveReminders.ts` the reminder rules. The trip eve push ("Your Lisbon trip is tomorrow",
  18:00 local the day before a dated trip with saved stops) is `prepareDueTripEves` (hourly cron)
  and `prepareTripEve`, delivered by `sendTripEve`, with its rules in `model/tripEve.ts`. See
  [contextual notifications](contextual-notifications.md).
- **`waitlist.ts`**: the public `join` action the web marketing site calls, plus the internal
  Resend projection and its bounded retry.
- **`feedback.ts`**: the public `submitFeedback` mutation (persist-first), plus the internal
  claim/finish delivery machine that projects each submission to the Resend support inbox with an
  hourly bounded retry. See [feedback delivery](feedback.md).
- **`http.ts`**: Convex Auth HTTP routes (`auth.addHttpRoutes`), the RevenueCat webhook at
  `/webhooks/revenuecat` (authenticated with the `REVENUECAT_WEBHOOK_SECRET` bearer secret),
  the waitlist receiver at `/waitlist/join`, the web Oracle at `/oracle`, the App Intents
  capture routes under `/app-intents/`, Apple's Get Retention Message endpoint at
  `/retention-messaging` (authenticated by the App Store's JWS signature, checked in
  `model/appleJws.ts`), the shared list invite preview at `/list/invites/`, and
  `GET /health` (200/503 probe for uptime monitors, backed by the `health.ts` `ping` query).
- **`crons.ts`**: refund consent sync retry, stale image import cleanup, stale processing-item
  failure, waitlist Resend retry, weekly shelf, save reminder and trip eve preparation, their delivery
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
  See [embeddings](embeddings.md).
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
  With an optional `listId`, `makeDatePlan` and `createTripPlan` plan from a shared list
  instead of the caller's saves: the claim checks membership and coverage (the live owner's
  Pro or the caller's), reads the list's unvisited places for the city, and sets a stop's `itemId` only when the
  caller owns that save. The names of the city's visited rows join `been`, so Apple can't
  suggest one back. A trip for a city with no unvisited list places is refused before the
  rate limit or any Apple call. AI permission for a list plan is the caller's plus every
  contributor's, former members included, so one decline means no Apple call for that run.
  Without `listId` nothing changes for old callers.
- **`mapPlaces.ts`**: `listMapPlaces`, every mapped place across the caller's ready saves
  (newest first, one entry per spot) for the Map tab, each with Apple's category (which picks
  the pin's icon) and its filter kinds from
  `model/placeKinds.ts`: Apple's point-of-interest category when the pin has one, otherwise
  the save's tags; "date night" always comes from the tags.
- **`placeVisits.ts`**: `setVisited` records or removes a user's "We went" mark.
  Planning reads these records inside Shelvr; they are not sent to an AI provider.
- **`placeRemovals.ts`**: `removePlace` stores an owned venue decision; `undoRemovePlace`
  deletes that decision idempotently. `model/placeRemovals.ts` projects a user's decisions over
  raw saves and membership intents on read. A pin matches by the city page's row identity
  (`uniquePlacePins`): one Apple id, or one name a few doors apart unless Apple ids differ.
  A label without a pin matches by name and city. City, Map, search, planning and
  automatic suggestions use the projection; source saves, existing trips and deliberate manual
  additions remain. A save a removal leaves with no place in a city leaves that city's reads
  (`visibleCitySave`), so its row, and a city with nothing else, go away; it stays open by id
  and in search. A save made after the removal shows the place again. Keep the
  `placeRemovals` table on rollback once rows exist.
- **`placeCorrections.ts`**, **`placeCorrectionSearch.ts`**: owner-only place editing and Apple Maps lookup. `items.placesEdited` preserves the chosen places across extraction retries and pin refreshes. A kept place with no pin still gets one from a lookup, which never changes a pin already on the save. Corrections update city grouping and search; existing trip stops remain unchanged. The editor leaves out removed places (`placeRemovals.ts`), and adding one back clears its removal.
- **`planShares.ts`**: "Ask someone" on a plan. `createPlanShare` stores the plan as a vote
  link and `latestPlanShare` reads its tallies back; the public `/plan/shares/` and
  `/plan/votes` HTTP routes (votes behind the waitlist secret and a per-IP limit) serve the
  web page at `apps/web/src/app/p`. Links and votes go with their space or account, and a
  daily cron deletes them a week after they close.
- **`sharedLists.ts`**: shared lists, the places two people keep together.
  `createSharedList` (Pro) needs at least one city, keeps them on the list and
  copies the caller's pins for them into `sharedListPlaces`; `listSharedLists` and `getSharedList` read a member's lists (members'
  first names, new-place counts, the caller's own trips from the list). A list's cities, there
  and in the invite preview, are the chosen ones first, then any others its places carry. `invitePreview`
  answers a signed-out caller from the token alone (`PUBLIC_ON_PURPOSE`), `joinSharedList`
  needs no Pro and is idempotent, `leaveSharedList` and the owner-only
  `removeSharedListMember` (which always rotates the token, even if that person already left) run `departMember` from
  `model/sharedLists.ts` in one transaction: the oldest live member inherits an owner's list,
  and the last member's leaving deletes it. Account deletion runs it one membership a pass. Coverage (`listCovered`) is "the live owner has Pro or the
  caller has Pro"; reading, joining, leaving and marking places need no Pro. Rules and
  caps live in `model/sharedLists.ts`; place tidying shared with trips in `model/tripPlace.ts`.
  The public `GET /list/invites/<token>` HTTP route (`getPublicInvite`, the same answer as
  `invitePreview`) is for the web invite page, as `/plan/shares/` is for the vote page.
  Rate buckets: `sharedListCreate`, `sharedListJoin`, `sharedListEdit`, `sharedListSearch`.
  Any member adds places: `addSavePlaces` copies a save's pins (the caller's own save, one
  city or all), `addSharedListPlace` stores an Apple search result, `removeSavePlaces` and
  `removeSharedListPlace` take them off, `setSharedListPlaceVisited` marks "We went" and
  `markSharedListSeen` resets what counts as new. Every add dedupes with `sameTripPlace`.
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
  `getTripPlan` returns the trip's `listId` when it has one. Editing a list trip and
  searching near it (`requirePlanAccess` in `sharedLists.ts`) need the list's coverage while
  the caller is still a member; otherwise, as for a personal trip, the caller's own Pro.
  Editing (Pro, `tripEdit` rate limit) is single-row writes in `tripPlannerData.ts`:
  `moveTripStop` (a day and position, day 0 is Unplanned), `removeTripStop` (to the top of
  Unplanned, never a delete), `addTripStop` (a search result as an
  `added` stop, or a pin the city's save already has), `renameTripPlan`, and
  `tripSavePlaces` for Add a place. Moves and removes return where the stop was, which
  the app's Undo sends back to `moveTripStop`. Stop ids survive every edit; only `deleteTripPlan` deletes
  stops. `tripPlanner.ts` `searchTripPlaces` (`tripPlaceSearch` rate limit) is Add a
  place's Apple search near the trip, refused like `createTripPlan` when AI is declined.
  `searchListPlaces` (`sharedListSearch` rate limit, through `claimListSearchInternal`) is
  the same search for a shared list. It and `searchTripPlaces` on a trip made from a list
  send Apple only the city name, never a point from someone's places, and need only the
  caller's own AI permission.
- **`placePins.ts`**: `placePins` on a save, the coordinates of the places it names, which the
  city page's map pins. `locateItem` looks up in Apple Maps the places read off the save
  (`items.places`) first, then its `open_maps` intent values (the save's own and its spaces'),
  and `storePins` writes at most 30, dropping any place no longer named.
  `items.placeLocations` keeps explicitly stated branch/address clues separately from display
  names. Caption and speech extraction preserve these clues for Apple lookup. A reread that
  learns a different clue clears only that place's old pin so the scheduled lookup replaces it;
  a lookup that lands after such a reread drops its pin, since it searched with the old clue;
  existing saves without clues keep their old behavior until reread. This optional field stays
  declared through rollback and is stripped from public item responses.
  Each pin also keeps Apple's place id (`appleId`) and point-of-interest `category` when the
  search result carried them; the Map tab's filters read the category.
  Every pin on a single-city save keeps its source city, including suburbs. For multi-city saves,
  Apple locality is used only when it matches a source-declared city; unmatched pins remain unassigned.
  Multi-city lookups keep explicit city qualifiers instead of using the first city as a bias.
  Only source cities can disable single-city outlier rejection; returned localities cannot.
  Pin lookup never expands `items.cities`; Home creates entries for the cities extracted from the source (up to 30). Scheduled from
  `finalizeItem` when a finished save has places or a Maps intent, from steering, and when a
  membership carrying a Maps intent is removed or dismissed; `backfillPage` refreshes older pins with no city or no category
  and looks up saves that still name a place with no pin, run by hand after deployment:
  `pnpm exec convex run --prod placePins:backfillPage '{"cursor":null}'` from `apps/native`. Skipped
  when AI is declined or the Maps key is unset. `model/appleMaps.ts` tells a temporary Apple failure
  (429, 5xx, network error, timeout) apart from no match and logs it as `apple_maps_unavailable`;
  `locateItem` then runs again, at most three attempts, 10 and 20 minutes apart, keeping its
  `refresh` and `keepPins` flags.
- **`demo.ts`**: the pre-payment onboarding demo save (`createDemoItem`, `retryDemoItem`), one
  per user, tracked in `onboardingDemos`. Onboarding no longer has a first-save step; the
  app still calls `createDemoItem` for a first save an older build queued before sign-in.
- **`freeSaves.ts`**: the free plan's 10 saves. `claimSave` runs in `createLinkOrNote` (app,
  share sheet and Siri link and note saves): Pro passes, otherwise it refuses with
  `pro_required` while the switch is off or 10 are held. A save holds its slot while
  processing and keeps it only if it finishes ready with a city (`settleFreeSave`, run
  from `finalizeItem`, the failure path and `deleteItem`); deleting a placed save gives
  nothing back. Retrying a free save needs no Pro, but one that gave its slot back takes a
  slot again (`reclaimFreeSave`). Adding a Maps list's other city parts needs no Pro. Photo saves and every plan stay Pro. `getFreeSaves` is the client's counter: null
  with Pro, or with the switch off for someone holding no free save (none pending or placed); `pending` counts saves
  still being read, and `open` is false once the switch is off, with `left` then 0.
  `freePlanOpen` answers a signed-out caller whether the switch is on, for onboarding's paywall.
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
  signed-out caller and as a deleting account, failing unless it throws "Not authenticated". It
  also builds a query and a mutation and fails if either builder calls the handler for those
  callers. So a function moved onto the builders adds no refusal test of its own.
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
  stays ready, and `failItem` answers `settled`. `reprocessItem` leaves `enrichment` set, so a
  failed Retry of a partial save goes back to ready and partial instead of leaving Home, and a
  Retry whose read adds nothing, or that finds no body or recipe for a save that has one, ends that
  way without asking the model. A Retry that does settle keeps the body, recipe, author and images
  its read lacks, and stays partial when the read found no article. `failItem` and the stale-processing cron are
  its adapters, and `failItem.test.ts` tests them directly.

**The AI model** is `gemini-3.1-flash-lite`, called directly through the `@ai-sdk/google` provider
(auth via the `GOOGLE_GENERATIVE_AI_API_KEY` Convex deployment env var, an AI Studio API key).

When editing anything in `convex/`, prefer the `convex-expert` skill. It covers object-form syntax,
`args` + `returns` validators on every function, and index-backed reads only.

## Web (`apps/web`)

- Next.js App Router marketing site only (no auth or product UI); server routes may call Convex
  for marketing forms such as platform waitlists
- Landing page at `/`. The product experience lives in the native app
- Free tool pages for search traffic, each with one App Store button: `/reel-place-finder`
  takes a pasted Instagram reel or TikTok link and lists the places its caption names, with
  Apple Maps and Google Maps links (`src/lib/reelPlaces.ts`). It posts to `/api/reel-places`,
  which forwards to the Convex `/reel-places` route (`reelPlaces.ts`, the same shared-secret
  and per-IP limits as the Oracle) and stores nothing

## Native (`apps/native`)

- The current onboarding share demo always uses a real reel: `src/lib/aha-sample.ts`
  picks the selected city and goal's reel, or Austin for that goal when no reel exists.
  Completion queues that exact URL; `useReplayOnboarding` saves it through
  `createLinkItem` once signed in with Pro, and normal reading and Maps lookup
  populate Home. The selected city answer stays separate from the sample city.
- UI localization uses `expo-localization` and the in-house `translate` in `src/lib/i18n-core.ts`,
  which falls back from the locale to its language to English, fills `%{name}` placeholders, and
  picks plural forms with the CLDR rules in `convex/model/localization.ts`. Read
  [`docs/architecture/localization.md`](localization.md) before adding visible copy;
  update all catalogs and run `pnpm localization:generate` after translation changes. It is a
  root script, so run it from the repo root. It writes `src/locales/catalogs.ts`,
  `src/locales/message-types.ts` and `convex/model/notificationTranslations.json`; never edit
  those by hand.
- Design tokens live in `src/unistyles.ts` (type, spacing, color, controls) and motion in
  `src/lib/motion.ts`. Read [design system](design-system.md) before adding
  UI, and [display font](display-font.md) before touching the title face.
- To run a branch or worktree on a simulator (Metro port, dev client link, sign-in, fixtures,
  forcing onboarding or the paywall), read [local QA](local-qa.md) first.
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
  `(home)` is Home. It shows two plan tiles, Plan a date and Plan a trip (they start straight
  away when one city has a mapped place, otherwise a "Which city?" sheet picks it; none with no
  mapped place), then the city cards (a cover or a pin on a tint, two to a row, a lone last
  city wide) and "Finding places…" for processing saves. Failed reads and finished saves without a city
  sit behind one "N saves without a place · Review" line, whose sheet has Retry and Delete
  (`src/components/home/review-saves.tsx`); a save that lands that way while the app is open
  shows a toast instead (`unplaced-toast.tsx`). It loads more saves on scroll, and on its own only
  until five unplaced saves are loaded, never past 200. Old deep links, pushes and Siri
  shortcuts to removed screens (spaces, search, digest, camera, the old trip, the old plan deck) open Home, through
  `src/lib/home-href.ts` and `src/app/+native-intent.ts`
- `city/[name]` is the city page: a map and numbered rows for distinct places from the
  city's saves, plus a row for every other save a removal has not emptied, with Plan a date
  and Plan a trip. Removing the last place keeps the map and says "No places left" until the
  person goes back. A selected place row shows an info button that opens Apple's place card
  (iOS 18+, `modules/apple-place-card`, needs the pin's `appleId`); tapping the row opens the save
- Shared lists: Home shows a "Shared lists" section above the plan tiles (one card per list from
  `listSharedLists`, nothing when the person has none). A list starts from the city page's Invite
  button beside the city's name (shown when the city has saves), which opens `new-shared-list` with that city picked.
  `shared-list/[id]` is a list: the same map-and-sheet shape as the city page, "New from <name>"
  first, a row menu for We went and Remove from list, city chips when the list spans cities,
  Plan a date and Plan a trip passing `listId`, Invite (the system share sheet with
  `/l/<token>` on the web origin), the person's trips from the list, and for the owner the
  member list. `new-shared-list` is the Invite form (Pro only): a name, a city or more,
  Send invite. `add-list-place` is the list's Add a place (`searchListPlaces` near the chosen
  city, plus the caller's saved places there). `spots/[id]` offers "Also add to" per list, off
  by default. The root route `list-invite/[token]` (outside `(app)` and `(auth)`) is the Join
  screen from `invitePreview`; Join stores the token in `src/lib/pending-invite.ts` and
  `useInviteJoinCoordinator` (mounted at the root layout) finishes the join once signed in,
  completing onboarding if needed. Gating: `src/lib/list-gate.ts`; a free member reaches
  `shared-list/[id]`, `add-list-place`, `date-plan`, `new-trip` and `trip-plan/[id]` only
  through a list, and a personal plan still redirects to `plan-gate`
- Other `(app)` routes: `add` (a pasted link only), `share`, `onboarding`, `paywall`, `plan-gate`, `new-shared-list`, `add-list-place`,
  `profile`, `settings`, `item/[id]`, `city/[name]`, `spots/[id]`, `date-plan`,
  `new-trip`, `trip-plan/[id]`, `add-trip-stop`
- `date-plan` is Plan a date, pushed from the city page with a `city` param: "What kind of
  date?" (Classic, Low-key, Surprise me),
  then the evening from `makeDatePlan`: both stops on a map, a card each with Hours and info
  and Change (only when another nearby stop fits), the approximate walk between, Send to your
  date (plain share text with Maps links) and Directions to stop 1 (Maps directions)
- `spots/[id]` is the moment after sharing links: "Finding the spots…" while the first saved one is
  read and pinned, then its pins drop onto the city most of them share, with Open <city> and
  Done (`src/lib/spots-reveal.ts` holds the waits). A failed save, one with no place, or a wait
  past 25 s goes Home, as every other share does. Creator videos film this moment
- `new-trip` is the trip planner form, a modal with an optional `city` param (the city page's
  Plan a trip opens it): city, days, optional start date, interests, pace and an optional
  stay. It checks Pro on submit, calls `createTripPlan` behind a three-step reveal, then
  replaces itself with `trip-plan/[id]`
- `trip-plan/[id]` is a planned trip: a map of the stops (tap a day to focus it), then day by
  day stops badged Yours or Suggested and an unplanned section. A save opens `item/[id]`, a
  suggestion opens Apple's place card or Maps by coordinates. The header menu edits, adds a
  place, or deletes it. Edit mode (`src/components/trip-planner/trip-edit-list.tsx`, rules in
  `src/lib/trip-edit.ts`) lays stops out in fixed-height rows: hold one to drag it within a
  day or onto another, minus sends it to Unplanned, plus puts an unplanned one on a day, the
  name is editable, and an Undo bar takes back the last move or remove
- `edit-save-places` edits the places on a ready save, with remove/replace/add and explicit Save.
- `add-trip-stop` is Add a place, a modal with `tripId` and `day` params: Apple Maps search
  near the trip plus the city's saved places not on it yet
  The old `trip/[id]` screen is gone and its links open Home; `trips.ts` and `tripData.ts`
  stay for installed builds
- `plan-gate` is the hard paywall: a signed-in account past onboarding without an active
  entitlement sees it instead of every other route except `profile`, `settings`, `paywall`
  and, for a member of a shared list, that list and plans started from it; it shows the
  person's lists above See plans
- `(auth)` holds a single `sign-in` route
- Scheme: `shelvr`. Bundle id: `app.shelvr.save` in production. `app.config.js` appends `.dev`
  or `.preview` for the other `APP_VARIANT` build profiles, so a dev install never collides
  with the App Store install
