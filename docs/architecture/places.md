# Place emoji and cuisine

Status: proposal, not built. Replaces an earlier draft that added shared `places`, `userPlaces` and
`userPlaceSources` tables. A Codex review on 2026-11-04 rejected that draft; why is under "The larger
design, and why not now".

## Goal

The city map and the Map tab show each place as an emoji, with filter chips by kind. Today the emoji
comes from Apple's category, then the save's tags (`convex/model/placeEmoji.ts`). In Austin nearly
every pin is 🍽️, because Apple calls them all `Restaurant` and a save's tags describe the whole reel,
not each place. A burger bar should be 🍔, a taco truck 🌮, a coffee shop ☕.

That needs one fact per place: what kind of food or drink it serves.

## Design

Keep everything about places where it is: pins on the save, visits in `placeVisits`, removals in
`placeRemovals`, copies in `sharedListPlaces` and `tripStops`. Add the per-place kind to the save,
next to the pins it describes.

### 1. The model names each place's kind

The extraction schema in `ai.ts` already returns `places` (names) and `placeLocations` (name and
location clue). Add an optional `placeKinds` list of `{ name, cuisine? }`, one per place, in the same
call. `cuisine` is one value of a closed enum that PR 1 defines in `convex/model/placeKinds.ts`, with
one entry for each emoji `NAME_WORDS` in `convex/model/placeEmoji.ts` can give (burger, pizza, tacos,
sushi, noodles, dumplings, bbq, steak, seafood, curry, pasta, donuts, ice cream, bakery, bagels,
dessert, coffee, tea, beer, wine, cocktails, brunch, sandwiches, salad, chicken). The model never
writes an emoji; code derives it from `cuisine`, and nothing stores one.

### 2. The save stores it

`items.placeKinds`, an optional array, written by `finalizeItem` from the run's classification under
the same rules as `places` (`model/settlement.ts`):

- Not written when AI is declined.
- Cleared with `places` when a re-read changes them.
- Dropped when the person edits the save's places (`placesEdited`). An edited place list has no
  stable identity to match a name-keyed kind against (a renamed or replaced place would keep the old
  cuisine), so the save loses `placeKinds` and its pins fall back to the name and Apple's category
  until a later re-read writes them again.

It is a new optional field, so it stays declared `v.optional` on rollback once rows carry it.

### 3. Pins carry it

`placePins.storePins` copies `cuisine` onto each pin whose name matches a `placeKinds` entry, as it
already copies `city`, `appleId` and `category`. The match is by name only, since `placeKinds`
carries no Apple id or point: both sides go through `placeKey`, and when one save names two places
with the same key the first `placeKinds` entry wins. A renamed place matches nothing and keeps no
cuisine; edits drop `placeKinds` anyway (section 2). The pin validators gain an optional `cuisine`, which
installed apps ignore. This counts as a public return change: the commit needs the
`Convex-Api: changed` trailer.

### 4. The phone picks the emoji

`placeEmoji` in `convex/model/placeEmoji.ts` tries, in order:

1. Apple's category, when it is a specific one (Museum, Park, Brewery).
2. The pin's `cuisine` (after PR 2).
3. A whole word of the place name ("Burger", "Taquería", "Café"), only when the category is missing
   or broad (Restaurant, FoodMarket, Cafe, Bakery, Nightlife).
4. A broad category's emoji.
5. The save's tags.

Steps 1, 3, 4 and 5 ship in PR 0, on the phone with no deploy, and work for old saves too.
For the filter chips, `placeKinds(category, tags)` in `convex/model/placeKinds.ts` gains a
`cuisine` argument that maps it to a kind (coffee to `coffee`, cocktails to `drinks`) and decides the
food or drink kind ahead of the category and the save's tags. Both callers pass `pin.cuisine`:
`cityPins` in `src/lib/city-pins.ts` (the city page) and `listMapPlaces` in `convex/mapPlaces.ts`
(the Map tab). Without that threading the chips stay per-save while the emoji is per-place.
Both dedupe a venue across saves with `mergeVenueKinds` (`convex/model/placeKinds.ts`), which PR 2
extends with the same rule it has for `category`: the kept pin's `cuisine` wins, and a later duplicate's `cuisine` fills it only when the kept one has none. PR 2 tests both duplicate orders.

### Old saves

A paginated internal `items:backfillPlaceKinds` can re-run extraction for ready saves that have
places but no `placeKinds`, only where `aiAllowed` passes for the save and its owner. It checks before
scheduling each save and again in the action right before the model call, so a save kept AI-free on
purpose is never sent to the model. A save that is deleted, or whose owner is gone or `deleting`
(`liveOwner`), is skipped. It costs a model call per save, so run it only after the new field has
proved its worth on new saves. Until then old saves fall back to name matching and Apple's category.

## Rollout

| PR  | Change                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| 0   | Name matching in `placeEmoji`. Client only                                                                                 |
| 1   | `placeKinds` in the extraction schema, `items.placeKinds`, settlement rules, tests against `testdata/settlement/rows.json` |
| 2   | `cuisine` on pins in `storePins`, the optional validator field, the client reading it. Deploy the backend first            |
| 3   | Optional backfill, run by hand                                                                                             |

## The larger design, and why not now

The rejected draft made a shared catalog of places, one per Apple id, and one row per person per place
holding their city, visits and removals. Codex found these problems in it, checked against the code:

1. **The catalog would not be free of personal data.** Pin names are the source's own words, not
   Apple's (`placePins.ts:391`). List pins keep the list's coordinates. Place editing accepts names,
   points and Apple ids from the client (`placeCorrections.ts:73`). The Apple lookup also accepts
   street addresses (`model/appleMaps.ts:183`). Refreshing a shared row from any of these would let
   one person's input change another person's place.
2. **One city per person per place is wrong.** The same venue can sit under Lisbon in one save and
   Belém in another, and a multi-city save can leave a pin with no city (`placePins.ts:70`).
3. **One `removedAt` loses today's removal rules.** A removal matches by Apple id, or by name within
   300 m unless the Apple ids differ (`model/placeRemovals.ts:22`). A newer save shows the place
   again while the older one stays hidden (`placeRemovals.test.ts:271`).
4. **Unmatched places had no safe identity.** Two "Central Cafe"s in one account would merge. One that
   later gained an Apple id would become a second row, leaving its visit behind.
5. **The rollout had two sources of truth.** Readers would switch before every write (We went, Remove,
   Undo, corrections) wrote both places.
6. **A popular place's row would be written by every save that names it.** That causes write conflicts
   across unrelated people's saves.
7. **The first model guess would become everyone's.** One misleading caption could label a steakhouse
   as sushi for every later user.
8. **Account deletion** would need a `liveOwner` check inside every write, so a late write cannot
   recreate rows after the drain.

A shared catalog is worth revisiting only if cross-user reuse becomes a product feature (for example
skipping the Apple lookup or showing what others saved). It would then admit only Apple-verified
public places, keep a person's own names, points and cities on their own rows, and keep the existing
visit and removal tables.

## Open question

Apple's developer agreement (Schedule 6) is reported to allow keeping Maps data only temporarily, and
Apple engineers have declined to interpret it on the developer forums
([thread](https://developer.apple.com/forums/thread/708672)). This design stores no more Apple data
than today: `cuisine` comes from the model, not from Apple.
