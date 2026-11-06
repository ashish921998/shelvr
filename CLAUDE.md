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

**Shelvr** is a "save-it-for-later" app. A user saves a link, image or note (most often a reel or
TikTok); a Convex action reads it and an LLM classifies it (title, tags, cities, places, spaces). Its places show under
their city on Home, and a city page has a map of them plus Plan a date / Plan a trip. The app
no longer shows **spaces**, but the backend keeps them for old builds and for the hidden space
behind each city's plans.

`apps/native` is the Expo app with its Convex backend in `apps/native/convex` (the source of
truth); `apps/web` is the marketing site only, with no auth or product UI, whose server routes
forward to Convex HTTP routes and store nothing. Business notes, marketing assets, metric
snapshots and store media live in the separate `shelvr-notes` repo; do not add them here.

## Commands

Use `pnpm`. `pnpm run check` from the repo root is the whole gate; `check:code` (everything but
the dependency audit) is what CI and the pre-push hook run. `pnpm dev` does not start the
backend: run `pnpm --filter native-app exec convex dev` in a second terminal, which also keeps
`convex/_generated/*` in sync. After changing copy, run `pnpm localization:generate`.

Before UI work read [design system](docs/architecture/design-system.md); before visible copy
read [localization](docs/architecture/localization.md); before simulator QA read
[local QA](docs/architecture/local-qa.md).

## Backend rules that cross modules

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
- For any edit in `convex/`, prefer the `convex-expert` skill.

## What grep won't tell you

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
- **Blocking a reported map page** is by hand, from `apps/native`:
  `pnpm exec convex run --prod publicMaps:setPublicMapBlocked '{"token":"<token>","blocked":true}'`
  (`false` unblocks). The token is the last path segment in the report email's subject. The
  owner cannot undo a block.
- **Save all lists skip `createSharedList`'s Pro check on purpose:** `saveCreatorMap`
  (`convex/creatorMaps.ts`) makes a follower's list without Pro. It and `creatorMapPreview`
  accept a city only in the page's exact stored spelling, so spelling variants cannot add cached
  scans of a creator's saves.
- **Privacy rules the code enforces on purpose:** a shared list's place search sends Apple only
  the city name, never a member's pin; a plan from a shared list needs every contributor's AI
  permission, former members included; `sharedListPlaces` copies no save title or text, and
  its `itemId` goes only to the person who added it; an Apple refresh token is never returned,
  logged or passed as a scheduled job argument (`detachedAppleTokens` holds it instead); public
  item reads strip `places` and `placeLocations`; a public map page returns only the owner's
  first name, its cities and, for each place from a link save, the name, a rounded point, an
  emoji, Been there and a post link rebuilt from the post's id; never a save's title, text, raw
  URL or id, and nothing once the owner is deleting or the page is blocked; a creator map's Save
  all copies into the saver's own list only a place's name, exact point, city, category, Apple id
  and rebuilt post link, never the creator's save title, text, raw URL, item id or tags; the copy
  is the saver's, so plans from it check the saver's AI permission, and it stays when the creator
  leaves.
- **An AI check cannot recall a request.** `aiAllowed` runs before a request goes out; a decline
  that lands mid-run is handled at settlement, which ignores the classification.
- **Rows outlive saves.** Deleting a save keeps its `tripStops` and `sharedListPlaces` rows.
- **Google Maps lists** are read through Google's undocumented list endpoint
  (`model/readers/googleMaps.ts`). A format change fails quietly to a plain page read.
- **Retired screens' links** open Home through `src/lib/home-href.ts` and
  `src/app/+native-intent.ts`, so an old link or notification never lands on a missing screen.

## Environment variables

The variables are listed in code, not here:

- Native app: `apps/native/.example.env`, plus `apps/native/app.config.js` and the profiles in
  `apps/native/eas.json`, which set `APP_VARIANT` (and `ANDROID_BUILD_ARCHS` on the
  development profiles)
- Web app: `apps/web/.env.example`
- Convex deployment: the `env` block in `apps/native/convex/convex.config.ts`, where the schema
  requires only `GOOGLE_GENERATIVE_AI_API_KEY`. Convex Auth's `JWT_PRIVATE_KEY`, `JWKS`,
  `AUTH_GOOGLE_*` and `AUTH_APPLE_*` are not declared there; `README.md` → Convex Auth sets
  them up

For the app, copy `apps/native/.example.env` to `.env.local`. To see what a variable does,
read the code that reads it. Feature switches such as `FREE_SAVES_ENABLED`, `SAVE_REMINDERS_ENABLED` and
`VIDEO_TRANSCRIPTS_ENABLED` stay off until set to `"true"`, so a deploy never turns one on.
`E2E_FAKE_AI` swaps Gemini for `model/fakeAi.ts` only on the local e2e backend, and is refused
anywhere else.

## Working conventions

`AGENTS.md` lists the one-line boundaries (no client `userId`, indexes, accurate validators,
`requireProEntitlement` and `claimSave`, logging, `newConvexTest()`); its table says what
enforces most of them, and `REVIEW.md` covers the review-only ones. These rules need more
than a line:

- **Public Convex functions are contracts.** The backend deploys on its own, OTA updates
  land one launch later and store builds lag for weeks, so an installed app keeps calling
  old shapes. Never change a public function's `args` or `returns` in the release that
  moves the client: expand (add a function or accept both shapes), deploy, move the
  client, then contract once the production channel shows no old bundle calling it.
  `tools/verify-convex-api.mjs` fails a pull request that changes or removes a public
  function's `args`, `returns`, `export` or kind (`query`, `mutation`, `action`).
  Add a `Convex-Api: changed` trailer, on a commit in the pull request (the check reads
  only commits after the merge base), only for a change an installed app survives: the
  expand step, or the contract step once no old bundle calls the old shape. The trailer
  passes the check either way. It cannot tell widening from narrowing, so an added field
  needs the trailer too.
- **AI passes write only `suggested` memberships** in `spaceItems`. Two exceptions: in a
  space with `autoFile` on (only while `dynamic` is on) the classifier inserts new matches
  as `saved`, for saves made after auto-file was turned on, never changing an existing
  row; and `steerItemForSpace` may update `intents` on `saved` memberships without
  changing their status. `saved` and `dismissed` belong to the user, and no AI pass
  overwrites them.
- **A table field is a one-way door once a row stores it.** Convex validates every row
  against the schema on deploy and rejects an undeclared field, so reverting the commit
  that added a field some row now carries fails the deploy. To back one out, stop writing it, keep it declared `v.optional(...)`,
  and drop the declaration once no row has it.
- **A moved native fingerprint strands OTA updates.** A change to a native module, a
  config plugin, `app.json` or `app.config.js` may move it, and the diff does not show
  it. Run `pnpm run verify:fingerprint origin/main HEAD` instead of guessing, and
  acknowledge an intended move with a `Native-Fingerprint: changed` trailer.
  `tools/verify-ota-compatibility.mjs` blocks a publish whose fingerprint does not match
  `apps/native/released-builds.json`: for production it runs as the `Verify the update can
reach the released build` step in `.github/workflows/release.yml`, for other profiles as
  the `before_update` hook in `native-update.yml`. The fix is a store build, then recording
  the release. The pull-request check covers only the production
  variant and cannot see `eas.json` build fields, `.easignore` edits or pnpm patches.
  Details: [push notification builds and updates](docs/architecture/push-notifications.md#what-the-fingerprint-hashes).
- **Every pull request shows how it was verified** in the template's Verification section
  (Renovate and Dependabot aside): what ran and its result, evidence a reviewer can open,
  and what was not verified. A pull request that touches UI files (`UI_PATTERNS` in
  `tools/verify-pr-evidence.mjs`) embeds a screenshot or recording. If nothing on screen
  changed, say why under Evidence and add the `no-ui-change` label when opening the pull
  request (`gh pr create --label no-ui-change`), or to an open one with
  `gh pr edit --add-label no-ui-change`. The `PR evidence` check fails a ready pull
  request otherwise.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`apps/native/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `apps/native`.

<!-- convex-ai-end -->
