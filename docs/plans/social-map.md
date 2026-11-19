# A useful Map before you have saved much

Status: plan only, nothing built. Written 2026-11-19.

## Problem

A save is private, and the Map tab shows only your own pins. `mapPlaces.listMapPlaces` reads the
caller's ready saves and nothing else, and `src/app/(app)/(tabs)/(map)/index.tsx` shows the
`map.emptyTitle` empty state when that list is empty. A new user opens the Map and sees nothing.

We agreed on an order:

1. Aggregate counts ("Saved by 10+ people"). No profiles.
2. Curated places for the top 10 to 20 cities, taken from public reels.
3. Profiles and follows later, seeded from shared-list members.

No gender question, and no profile step in onboarding.

**Step 1 does not fill an empty map.** It adds a count to pins you already have. Only step 2 puts pins
on a new user's map. The metrics below are set so that each step is judged on what it can change, and
the case for step 2 is measured before step 1 ships (see "Measure first").

## Constraints from earlier decisions

`docs/architecture/places.md` ("The larger design, and why not now") rejected a shared place catalog
for eight reasons. Its last paragraph names the conditions for revisiting it: admit only
Apple-verified public places, keep a person's own names, points and cities on their own rows, and keep
the visit and removal tables. Both step 1 and step 2 add something cross-user, so both are held to that
paragraph:

| Rejection in `places.md`                        | How this plan answers it                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Pin names and points are personal            | Step 1 stores only an Apple id and a count, with no name or point. Step 2's rows come from our own curation, not from a user's pin.                                  |
| 2. One city per person per place is wrong       | No per-person city is stored. Step 2's city is the city we curated it for.                                                                                           |
| 3. Removal rules are subtle                     | The count reuses `visibleItemPlaces` (`model/placeRemovals.ts`), so a place you removed stops counting by the same rule that hides it.                               |
| 4. Unmatched places have no safe identity       | Only pins with an Apple id count. A pin without one does not count, and nothing is merged by name. `samePlace` is **not** used, since it merges different Apple ids. |
| 5. Two sources of truth during rollout          | Pins on the save stay the only source. Step 1's rows are derived from them by one helper and can be rebuilt at any time.                                             |
| 6. A popular place's row written by every save  | No save writes a shared row. A daily rollup, which runs one job at a time, writes the counts.                                                                        |
| 7. The first model guess becomes everyone's     | Step 1 shares no model output. Step 2's places are reviewed by a person before they go live.                                                                         |
| 8. Late writes after the account deletion drain | The per-user sync checks `liveOwner` inside the mutation that writes, and the drain deletes the user's rows.                                                         |

The "Privacy rules the code enforces on purpose" in `CLAUDE.md` still hold. Notably, public item reads
strip `places` and `placeLocations`, and `sharedListPlaces` copies no save title or text. Nothing below
loosens either rule.

## Measure first (no build)

Run these as one-off reads before deciding on step 1. Ask the owner first, because they read
production.

- **Coverage.** The share of ready saves' pins that have an `appleId`. Only those pins can be counted.
- **Overlap.** How many distinct Apple ids have at least 5 distinct live savers today, and what share
  of an average user's pins they cover. If almost no place reaches 5, step 1 shows almost nothing.
  Step 2 then matters more, and step 1 can wait.
- **The empty map's cost.** From PostHog: `map_opened` with `count = 0`, as a share of new users in
  their first week, and their day-7 retention compared with new users whose first `map_opened` had
  `count > 0`. This is the number that justifies step 2. It is measurable today.

## Step 1: "Saved by N people"

### What the person sees

On your own pins only: the Map tab pin's `snippet` (which today carries "We went"), and the place
rows on the city page. The text is bucketed: "Saved by 5+", "10+", "25+", "50+", "100+". There is no
exact number, no list of who saved it, and no link to anyone's save or reel.

### Identity

The key is the Apple place id (`placePins[].appleId`), and nothing else. One person counts once per
Apple id, however many saves name it. A pin without an Apple id does not count.

Apple ids come from two places today:

- **The server.** `placePins.locateItem` and `identifyPins` look them up from Apple, and only when
  `aiAllowed` passes (see `toIdentify`).
- **The client.** `placeCorrections.savePlaces` accepts an Apple id the app sends (`placeCorrections.ts:27`,
  checked only for length). That id comes from MapKit search on the device, but a modified client can
  send any id.

A forged id only adds one person to one place. Pushing a place to "5+" takes five accounts. To make
that costly, count only accounts at least 7 days old with at least 3 ready saves. Whether to also
discount client-sent ids is an open question.

### Data model

```ts
// One row per (person, Apple id) they have a visible pin for. Derived, rebuildable.
placeSavers: defineTable({
  userId: v.id("users"),
  appleId: v.string(),
})
  .index("by_user", ["userId"])
  .index("by_apple_id", ["appleId"]),

// Written only by the daily rollup. A row exists only when savers >= MIN_SAVERS.
placeSaveCounts: defineTable({
  appleId: v.string(),
  savers: v.number(),
  rolledUpAt: v.number(),
}).index("by_apple_id", ["appleId"]),
```

Neither table stores a name, a point, a city or an item id. That keeps rejection 1 out, and leaves no
link from a count back to a save.

### One helper that writes `placeSavers`

`syncPlaceSavers(ctx, userId)` is an internal mutation, and the only writer of a user's rows:

1. If `liveOwner(ctx, userId)` is null, or `aiAllowed` is false, or the account fails the age and
   saves bar, delete the user's rows and stop.
2. Read the user's ready saves through `readySavesNewestFirst`, the same reader `listMapPlaces`
   uses. It already applies place removals. Then collect the set of Apple ids. That reader stops at
   `CITY_SCAN_ROWS` (1,000) saves or 4 MiB, so a heavy saver's oldest places do not count, just as
   they do not show on their Map today.
3. Compare that set with the user's rows `by_user`, then insert and delete the difference.

Because it rebuilds from the saves, a missed trigger only delays a change. It cannot corrupt the
count. Schedule it with `runAfter(0, ...)` from every path that changes which pins a user has. No
debounce table: a duplicate sync finds no difference and writes nothing, so it costs only reads.
These are the paths:

- settlement: `finalizeItem` and `failItem` (`model/settlement.ts`)
- `placePins.storePins` (Apple lookups land here, possibly after a drain has started; the
  `liveOwner` check in the helper covers that)
- `items.pinListPlaces` and `items.addPlaceListParts` (the Google Maps list split)
- `placeCorrections.savePlaces`
- `placeRemovals.removePlace` and `undoRemovePlace`
- `items.deleteItem`
- `aiConsent.setConsent`
- `placePins:backfillPage`, which patches pins directly

A weekly sweep catches any path this list misses. It reschedules the sync only for users with a
save updated since the last sweep, because a sync re-reads every ready save, and a link save can hold
about 100k characters. A daily sweep over every user would re-read the whole items table every day.

### The daily rollup

A cron runs once a day. It walks `placeSavers` `by_apple_id` in pages and counts rows per Apple id.
One Apple id's rows can span a page boundary, so the running count for the last Apple id on a page
carries into the next page. Where the count is at least `MIN_SAVERS` (5), it writes `placeSaveCounts`
stamped with the run's start time, and where it is below, it deletes the row. A last pass deletes every
`placeSaveCounts` row with an older `rolledUpAt`. That catches an Apple id with no `placeSavers` rows
left, which the walk never visits, for example after its last saver deletes their account. The rollup
runs as a single chain of scheduled mutations, so no two writes contend for a popular row.
The rows are small (two short strings), so a full walk stays cheap. At 10,000 users with 50 places
each, that is 500,000 rows a day.

### Why a minimum alone is not enough

A friend who watches a place go from 4 to 5 right after you save it learns that you saved it. Three
things make that harder, though none rules it out:

- **Buckets.** The display moves only at 5, 10, 25, 50 and 100.
- **A daily rollup.** A count never moves within minutes of a save.
- **The account age and saves bar.**

The leak that remains (a friend sees a place reach "5+" on the day you said you saved it) is small. It
belongs in the privacy policy text.

### Public functions

One new query, and no change to any existing `args` or `returns`, so no `Convex-Api: changed` trailer:

- `mapPlaces.placeSaveBuckets`: `authedQuery`, `args: {}`, returns
  `v.array(v.object({ appleId: v.string(), bucket: v.number() }))`. It reads the caller's own
  `placeSavers` rows and looks up each count. Taking no arguments means nobody can probe an Apple id
  they have not saved.

The client joins the result onto `listMapPlaces` pins by `appleId`. Widening `mapPlaceValidator`
instead would change a public return.

### Account deletion

`users.ts` gains a `placeSavers` `by_user` batch in `deleteUserOwnedDataBatch`, before items are
deleted. Its row in `accountDeletion.test.ts` follows the `.agents/skills/account-deletion` skill.
`placeSaveCounts` holds no user key; the next rollup lowers the count. `users.ts` is an owner path
(`OWNER_PATTERNS`), so the pull request needs the owner's `/approve <commit>`.

### AI permission

Counting sends nothing to Gemini, SerpAPI or Treg, so the `aiAllowed` rule does not strictly apply.
But every server Apple id came through an `aiAllowed`-gated lookup, and a person who declines expects
their content to stay out of shared features. So a declined user's rows are deleted at the next sync,
and they count for nothing.

### Metric to decide on step 2

Step 1 cannot change the empty map, so it is judged on its own: the share of `map_place_opened` taps
on pins with a bucket compared with pins without one, and the share of users' pins that show a bucket.
The decision on step 2 rests on the empty-map measure under "Measure first", not on step 1.

### Size

- Backend: about 3 days. That covers two tables, the sync helper and its triggers, the weekly sweep
  and rollup crons, the drain batch, and tests (one per trigger, plus the drain).
- Client: about 1 day for the snippet, the city page row, copy in nine catalogs, and analytics
  properties.
- Also: owner approval for `users.ts`, and a privacy policy update before release.

## Step 2: curated reel-sourced places

### What the person sees

In the top 10 to 20 cities, the Map shows "Shelvr picks" pins under your own. They have a different
look (a muted tint, with your own pins drawn above). Tapping one opens a card with:

- the place name
- "From @creator", linking out to the reel
- the Apple place card, when `canOpenPlaceCard(appleId)` is true
- **Save**, which creates an ordinary link save of the reel URL through the existing capture path, so
  `claimSave` and the free-save limit apply as usual

A new user in a curated city no longer sees the empty state.

### Not an "editorial user"

Curated reels must **not** go in as saves of a staff account. They would count in step 1, use free
saves, enter spaces, go through settlement, and show up as a person's data in every drain and test.
They get their own tables and a run-by-hand action, like the existing backfills.

### Data model

```ts
editorialPlaces: defineTable({
  city: v.string(),             // the city we curated it for
  name: v.string(),
  lat: v.number(),
  lng: v.number(),
  appleId: v.string(),          // required: Apple-verified places only
  category: v.optional(v.string()),
  cuisine: v.optional(cuisineValidator),
  sources: v.array(v.object({   // capped at 3
    url: v.string(),
    platform: v.union(v.literal("instagram"), v.literal("tiktok"), v.literal("youtube")),
    creator: v.string(),        // "@handle", from the reader's `author`
  })),
  status: v.union(v.literal("draft"), v.literal("live"), v.literal("withdrawn")),
  addedAt: v.number(),
})
  .index("by_city_and_status", ["city", "status"])
  .index("by_apple_id", ["appleId"]),

editorialReels: defineTable({   // what was read, so a reel is never read twice
  url: v.string(),
  city: v.string(),
  readAt: v.number(),
  outcome: v.union(v.literal("placed"), v.literal("no_places"), v.literal("unreadable")),
}).index("by_url", ["url"]),
```

The tables store no media. No `heroImageUrl`, no `media`, no poster, no caption text, and no
transcript.

### Ingestion through the existing pipeline

`editorial:ingestReel({ url, city })`, an internal action run by hand with
`pnpm exec convex run --prod editorial:ingestReel '{...}'`:

1. `readPage(url, { claimPaidRead })` from `model/pageRead.ts`. It takes no item, so it can be reused
   as it is. `storePoster` is **not** called.
2. Classification. `classifyLink` in `ai.ts` takes a `LinkCall` that is built from the item today.
   Extract the prompt builder so it takes the page reading and a city, and call it from both
   `analyzeLinkItem` and the new action. Only the `places`, `placeLocations` and `placeCuisines`
   fields are kept.
3. Speech (`fromSpeech`) takes an item, and costs a paid Treg call when `VIDEO_TRANSCRIPTS_ENABLED` is
   on. Leave it out of the first version: captions name most places in curated reels. Add it if the
   "no places" rate is high.
4. Apple lookup for each place through `appleMapsLookup` (`model/appleMaps.ts`), with the curated city
   as the clue, keeping only matches in that city. A place with no Apple match is dropped.
5. Write `draft` rows, merging into an existing row by `appleId` (adding the reel as a source).

Review is done by hand: the owner reads drafts in the Convex dashboard and sets them `live`. A small
internal mutation, `editorial:setStatus`, does the same in bulk. "Withdrawn" is how a creator's
takedown request is honoured.

### Public functions

- `editorial:mapPlaces`: `authedQuery`, `args: {}`, returning the `live` rows' name, point, Apple id,
  category, cuisine, kinds, city and sources. At 20 cities with about 60 places each, that is about
  1,200 rows, under the 3,000 cap `listMapPlaces` uses. Add a `city` argument later if the list grows.
  It is a new function, so no contract change.

### Client changes (OTA, no native change)

There is no `src/lib/use-map-pin-clusters.tsx`. Pins are drawn by `expo-maps` in
`src/components/map/places-map.tsx`, with no clustering. The files that change:

- `src/app/(app)/(tabs)/(map)/index.tsx`:
  - merge editorial pins after your own, and drop an editorial pin that `samePlace` matches to one of
    yours (your pin wins)
  - give editorial pins an id that does not start with an `itemId`, since `placeId` assumes one
  - in `select`, open the Apple card or the editorial card, never `/item/[id]`
  - show the empty state only when both lists are empty
- `src/lib/map-filters.ts`: kind filters and search include editorial pins. The "went" switch and
  `visitMatcher` cover your own pins only.
- `src/lib/city-pins.ts` / `framedPins`: frame on your own pins when you have any. Otherwise frame on
  the nearest curated city.
- A "Shelvr picks" chip to hide them.
- The city page map (`src/components/city`) is left out of the first version.

### Cost per city

The cost per city is `R × (one Gemini call + P Apple lookups [+ one Treg transcript])` plus the time to
pick reels. R is the number of reels, about 30 to 50 per city, and P is about 3 to 5 places per reel.

- The model is `gemini-3.1-flash-lite` (`model/aiProvider.ts`), so model cost is small next to
  everything else.
- Apple lookups count against the Maps Server API daily quota, not money.
- A TikTok caption read can be a paid read (`claimVideoRead("tikTokCaption")`), and a transcript is a
  paid Treg call. Check both prices before running, rather than estimating them here.

The real cost is people: choosing good reels and reviewing drafts takes 1 to 2 hours per city. That
is 2 to 5 days for 15 cities, plus a refresh every few months as places close.

### Platform terms to check before building

- **Instagram and TikTok.** Read their terms on automated collection, and the terms of the oEmbed and
  embed endpoints the readers use (`model/readers/instagram.ts`, `tiktok.ts`). Today a user's own save
  triggers the read. Here we read on our own behalf, for content we publish to every user, which is a
  different use.
- **Creator credit and consent.** Showing "@handle" and a link is credit, not permission. Ask creators
  first. A short DM ("we'd like to feature your Lisbon reel, with credit and a link") also starts the
  creator relationships that step 3's profiles need. Publish a takedown address.
- **Apple Maps data.** `places.md` already notes that Apple's developer agreement (Schedule 6) is
  reported to allow only temporary storage of Maps data. Editorial rows store an Apple id and a point
  we looked up, for every user, indefinitely. Decide whether to store the point from our own curation
  (for example a reviewed copy) and keep the Apple id only as a reference. Get advice before
  launching.

### Metric to decide on step 3

For new users in curated cities against other new users, over their first 14 days:

- the share who open a "Shelvr picks" pin
- the share who save from one
- day-7 retention

Step 3 is worth building if editorial pins lift retention and people tap "From @creator". That would
show that people care who a place comes from, which is the premise of follows.

### Size

- Backend: about 4 days. That covers the `classifyLink` refactor with tests, the two tables, the
  ingest action, the status mutation and the map query.
- Client: about 3 days for the map layer, the card, the chip, empty-state rules, copy and analytics.
- Curation: 2 to 5 days of the owner's time for 15 cities, after the terms check.
- No owner-path files.

## Step 3: profiles and follows, later

### What changes

Following someone is the first time one person sees another's places outside a shared list, so it
ends private-by-default for anyone who opts in. Visibility is set per account: "Show my places to
people who follow me", off by default, with follow requests approved by hand. What a follower sees is
place name, point, city and kind, never the save, its title, the reel or a photo. That matches what
`sharedListPlaces` copies today.

### When to ask for a profile

Only when it is needed, never in onboarding:

- **The first shared-list join** (`src/lib/invite-join.ts`): members already see each other's first
  name (`users.name`, set by `setMyName`, read by `firstNameOf`). Ask for a username and an optional
  photo there.
- **The first follow, or the first "Show my places" switch.**

### Seeding

On the profile screen, suggest people you already share a list with (`sharedListMembers`), only when
they also have a profile. This reveals nothing new: list members already see each other.

### Data model

```ts
profiles: defineTable({
  userId: v.id("users"),
  username: v.string(),          // unique, lowercase
  photoStorageId: v.optional(v.id("_storage")),
  placesVisible: v.boolean(),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_username", ["username"]),

follows: defineTable({
  followerId: v.id("users"),
  followeeId: v.id("users"),
  status: v.union(v.literal("requested"), v.literal("accepted")),
  createdAt: v.number(),
})
  .index("by_follower", ["followerId"])
  .index("by_followee_and_status", ["followeeId", "status"])
  .index("by_pair", ["followerId", "followeeId"]),

blocks: defineTable({ blockerId: v.id("users"), blockedId: v.id("users"), createdAt: v.number() })
  .index("by_blocker", ["blockerId"])
  .index("by_pair", ["blockerId", "blockedId"]),

reports: defineTable({
  reporterId: v.id("users"),
  targetUserId: v.id("users"),
  reason: v.string(),
  createdAt: v.number(),
  status: v.union(v.literal("open"), v.literal("actioned"), v.literal("dismissed")),
}).index("by_status", ["status"]),
```

The names are kept separate from `users` so that the `users.ts` owner file changes only for the drain.

### Public functions (all new)

- `profiles:getMine`, `profiles:claim({ username })`, `profiles:setPhoto`, and
  `profiles:setPlacesVisible`.
- `follows:request`, `follows:respond`, `follows:remove`, `follows:listMine`, and
  `follows:suggestions` (from shared lists).
- `follows:placesOf({ username })`: visible only when you have an accepted follow, the person has
  `placesVisible` on, and neither has blocked the other.
- `safety:block`, `safety:unblock`, and `safety:report`.

Every function uses `authedQuery` or `authedMutation`, with no client `userId`.

### Rules it must keep

- **Usernames and photos are user-generated content.** Before App Review, check the current text of
  App Store Review Guideline 1.2: filtering objectionable material, reporting, blocking, and published
  contact details.
- **Photo moderation.** Moderating photos with Gemini sends content out, so it needs `aiAllowed`.
  Without permission, use manual review or no photo.
- **Age.** No gender, ever. Ask for a birth date only if the App Store age rating for user-generated
  content requires it. Check the current age rating questionnaire, and whether Apple's declared age
  range API can answer the question without a birth date.
- **The photo is a `_storage` blob.** Follow the `.agents/skills/image-import-storage` skill before
  writing its upload and cleanup.
- **Account deletion.** The drain deletes the profile and photo, follows in both directions, blocks in
  both directions, and reports the user filed. Whether to keep reports about the user for a period is
  an open question.

### Metric that would justify more

The share of shared-list members who claim a profile when asked, the follows per profile, and the
share of profiles that turn on "Show my places". If few turn it on, follows have nothing to show, and
step 2's editorial and creator layer is the better investment.

### Size

About 2 to 3 weeks: backend 1 week, client 1 to 1.5 weeks (profile, follow, block, report and
moderation flows, copy in nine catalogs), plus App Review time and an owner `/approve` for the
`users.ts` drain.

## Open questions

1. Run the three "Measure first" reads against production? They are reads only, but they touch every
   save.
2. Should Apple ids that the client sent (`placeCorrections.savePlaces`) count in step 1, or only ones
   the server looked up? Not counting them needs a new optional field on each pin recording its source.
3. Is the account age and saves bar (7 days, 3 ready saves) and `MIN_SAVERS = 5` right?
4. Does step 1 need an opt-out ("Count my saves in 'Saved by'") in Settings, in addition to the AI
   permission? Either way, the privacy policy needs a line before release.
5. Step 2's Apple storage question: may we keep Apple-looked-up points for curated places
   indefinitely?
6. Ask creators before featuring them, or credit them and honour takedowns?
7. Which 10 to 20 cities? Ranking cities by where new users' first saves land (`items.cities`) points
   the curation at real demand.
8. Step 3: are follows one-way with approval (as proposed), or mutual only? And how long are reports
   kept after an account is deleted?
