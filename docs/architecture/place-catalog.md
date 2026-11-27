# Places: one shared catalog

Decided on 2026-11-20. Built in phases; phase 1 is PR #789.

## Goal

Every real venue is stored once. Every feature that shows, counts or plans a place points at that
row instead of copying a name and a point. The design holds at any number of people and places: no
row is written by every save that names it, and no query reads every place.

## Today

- A save keeps its places on its own document: `items.places` (names), `items.placePins` (name,
  point, city, Apple id, category, cuisine), `items.placeLocations` and `items.placeCuisines`.
- `tripStops`, `sharedListPlaces`, `placeVisits`, `placeRemovals` and place corrections copy a name
  and a point into their own rows, and match places by a normalized name.
- The Map reads the person's newest ready saves, at most 1,000 saves or 4 MB of save documents
  (`rawReadySavesNewestFirst` in `convex/items.ts`). Past that, older saves' places drop off the Map,
  Home and city pages. A link save can hold about 100k characters of page text.
- `places` holds the places we pick by hand for Discover (`convex/places.ts`).

## Tables

| Table                                                           | One row per                               | Holds                                                                                                                                                                    | Written by                                                                     |
| --------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `places`                                                        | real venue that anyone saved or we picked | provider ids (Apple now, others later), a copy of the provider's name, point, city and category, our "picked by hand" mark, sources, reviewed cuisine, kind and features | a save (only to add a missing venue), the imports, the refresh job, moderation |
| `savedPlaces`                                                   | place that a save names                   | a link to `places` when matched, the save's own name for the place, its city, the model's category and cuisine, and a point only when unmatched or corrected             | the save pipeline and corrections                                              |
| `placeStats`                                                    | venue                                     | how many people saved it                                                                                                                                                 | a scheduled job                                                                |
| `placeVisits`, `placeRemovals`, `tripStops`, `sharedListPlaces` | as today                                  | as today, plus a link to `places`                                                                                                                                        | as today                                                                       |

`savedPlaces` replaces `items.placePins`, `items.places`, `items.placeLocations` and
`items.placeCuisines`. A matched row reads its point from `places`, so each fact has one owner and no
save keeps a permanent copy of a provider's point. A person's correction is the one exception: a matched
row with a corrected point keeps that point, and it wins over the one in `places`. A place the provider cannot match has a
`savedPlaces` row with no link and its own point.

## Rules

1. A shared row never holds one person's input. A save's wording, a list's coordinates, a
   correction and the model's guesses live on that person's `savedPlaces` row.
2. A provider id is a permanent key. A provider's name, point and category are a copy that we
   refresh.
3. A save adds a `places` row only when the venue is missing. It never edits an existing row.
4. Being in `places` shows nothing to anyone. Discover shows rows that we picked by hand, and later
   rows that at least a minimum number of people saved.
5. Every query is bounded: by person, by save, by place or by map area.
6. Hiding a `places` row hides it from Discover only, never from a person's own Map.
7. Account deletion removes the person's `savedPlaces`, visits and removals. `places` rows hold no
   personal data and stay. Every `savedPlaces` write checks `liveOwner` in the mutation that writes.

## Labels: kind, type and features

A provider's category says what the building is, not what a person goes there for. Apple files a
hotel's rooftop bar as a hotel and most cafés as restaurants. Every place therefore carries three
labels of our own:

| Label        | Answers                   | Per place | Examples                                                           |
| ------------ | ------------------------- | --------- | ------------------------------------------------------------------ |
| **Kind**     | What do you go there for? | one       | food, drinks, coffee, dessert, activities, shopping, stay          |
| **Type**     | What exactly is it?       | one       | `portuguese_restaurant`, `sushi_restaurant`, `cocktail_bar`, `pub` |
| **Features** | What is it like?          | many      | rooftop, terrace, view, waterfront, live music, late night, hidden |

The kind drives the Map's filter chips, as it does today. The type is the sub-category inside a
kind. Features cut across kinds: a rooftop can be a bar, a restaurant or a hotel pool.

Only the kind, the cuisine and four features exist today (PR #794). The type, the rest of the
features and everything under "Who fills them" and "What the app shows" are planned; "Order" says
when.

### Type

The type is a category id from Overture's places taxonomy, which also covers Foursquare's open
places. We adopt their list instead of writing our own, so an imported place arrives with a type
already set. Their data may be stored and shown on any map
([Overture places](https://docs.overturemaps.org/guides/places/)). Apple's terms allow only
temporary storage of its place data, so a stored point should come from an open-data match
(DPLA Attachment 6, §2.5).

A test on Lisbon (Overture release `2026-11-18.0`, 51,592 places) found:

- 9,966 food and drink places across 137 types, including `cocktail_bar`, `wine_bar`, `pub`,
  `lounge`, `hotel_bar`, `tapas_bar` and 70 national cuisines.
- Gaps: 24% of the restaurants carry only the bare `restaurant` type, 3% of all places have no
  type, and some are wrong (a rooftop bar typed `professional_service`).
- No type for a rooftop, a terrace or a view. Those are features.

So the open type is a starting point, and a type we set by hand wins. A row keeps the two apart:
`sourceType` holds Overture's type and `type` holds ours, so a refresh that changes `sourceType`
never touches a type we set. Each type maps to one kind
through the first two levels of its taxonomy path:

| Overture path                                                              | Kind                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `food_and_drink` > `restaurant`                                            | food                                                                                            |
| `food_and_drink` > `alcoholic_beverage_venue`                              | drinks                                                                                          |
| `food_and_drink` > `non_alcoholic_beverage_venue`                          | coffee                                                                                          |
| `food_and_drink` > `casual_eatery`                                         | by type: `bakery`, `ice_cream_shop`, `dessert_shop` → dessert; `cafe` → coffee; the rest → food |
| `lodging`                                                                  | stay                                                                                            |
| `shopping`                                                                 | shopping                                                                                        |
| `arts_and_entertainment`, `cultural_and_historic`, `sports_and_recreation` | activities                                                                                      |

A type will also give the pin's emoji (`pizza_restaurant` 🍕, `wine_bar` 🍷), replacing most of
today's guessing from the cuisine and the name.

The `places` schema has no type field yet. When it gets one, the type will be stored as a plain string, not a fixed list, so a new or renamed Overture category never
fails a deploy (see "A table field is a one-way door" in `CLAUDE.md`). Code will keep a list of the
types we show, about 60, each with a label in every language. A type outside that list will show
only its kind.

### Features

A fixed starter list, as plain strings for the same reason:

- **Setting:** rooftop, terrace, view, waterfront, garden, outdoor seating
- **Where:** in hotel, hidden or speakeasy, food hall
- **When and how:** late night, brunch, live music, date night, good for groups, counter seating

PR #794 ships the first four (rooftop, terrace, view, in hotel) as a fixed list. Its schema fields
move to plain strings before the list grows.

### Who fills them

- **Discover places.** An import matches each venue to Overture by name and point, and keeps the
  Overture id and type. Features come from the source we import from: a guide titled "rooftop bars"
  tags every place in it. Gemini reads the guide's text for the rest. `places:curate` fixes what is
  still wrong. A Discover import holds no person's content, so it needs no AI permission check.
- **A person's saves.** The classifier already returns a cuisine for each place it names
  (`placeCuisines` in `convex/ai.ts`). It also returns a type, from the 60 we show, and features,
  for each place. They stay on that person's save, and later on their `savedPlaces` row (rule 1).
  A model's guess never writes to `places` (rule 7 of the earlier objections).
- **By hand.** `places:curate` sets the kind, cuisine and features today; it gains the type.

### What the app shows

- The kind chips stay as they are.
- Picking a kind shows a second row of chips: its common types and features in view, such as
  Drinks → cocktail bar, wine bar, rooftop.
- A place's detail lists its type and features.
- Search matches type and feature labels in the person's language. Today it matches the English
  feature words only.

### Order

1. PR #794: kind, cuisine and four features, set by hand.
2. Store an Overture id, type and `googlePlaceId` on `places`, matched at import. Move the stored
   point to Overture.
3. The full-screen place page with our own data and an "Open in Google Maps" button (see "First
   version" under "Provider data"). It has no map, so it can ship before the Mapbox map. Not needed
   while Apple's place card covers it (see "Until then we stay on Apple").
4. The Mapbox map, once open data finds the places people save (see "Until then we stay on
   Apple"). It needs a store build, because it moves the native fingerprint. Apple drops out.
5. The type list, its labels in every language, and pin emoji from the type.
6. Type and features from the classifier for saves.
7. The second row of chips on the Map, and the type and features on the place page.

### Open questions

- **Overture attribution.** What the app must show when it uses Overture data.
- **Matching** an Overture place to its Google id, and what to do when the two disagree on the
  point or Google finds a different venue.
- **Google's written confirmation** of rules 1 and 2 under "Provider data".
- **Which 60 types.** The Lisbon counts above are a first cut; a second city should confirm them.

## Shared search rollout

Deploy the catalog backend before shipping the Swift search client in PR #911. Run
`places:backfillSearchName` with `{"cursor":null}` on the target deployment and wait for
`places_search_names_backfilled` with `done: true`. The job fills the folded search index
for existing places in batches and can be restarted. During the rollout, search also reads
the raw-name index for rows awaiting backfill. Discover remains limited to curated rows.

## Reading by area

`places:inArea({ box })` returns up to 300 Discover places inside a map area, and `complete`, which is
true only when it read the whole area. It reads in one of two ways, and both stay far below Convex's
limit of 4,096 index ranges for each query. `places:forMap({})`, kept for the phase 1 client, still
returns up to 3,000 live rows for the whole world, as it did in phase 1.

- A box narrower than 90° of longitude reads a geospatial index (`@convex-dev/geospatial`). The index
  holds only the rows that Discover can show, so a save never writes to it, and it grows only as large
  as Discover. A query makes at most two calls to it. In a test with 1,860 places, a box 80° wide
  read 646 index ranges.
- A wider box reads the live rows in the order they were added. It keeps the first 300 inside the box
  and looks at no more than 2,000 rows, in one index range.

The index's level options are fixed once it holds points. The component removes a point by the cells
it computes from the current options, so after a change to `minLevel` it cannot find the cells of
points indexed before. Change the options only when the index is empty.

The Map works out the visible area from the camera's centre, zoom and screen size, and from the span
that the map reports when it is rotated or tilted. It snaps the area to a grid, whose cells are never
smaller than about a kilometre however far the person zooms in, and asks again only
once the camera rests, so a pan does not open a new query on every frame, and a return to an area
reuses the answer the person already has. Convex caches `inArea` for each person, not across people,
because the query reads who is calling. A view half the world wide or wider asks for the whole world.

Before the camera reports an area, the Map asks for the whole world. For a person with no saves, the
capped answer feeds the Map's "busiest city" framing. Without the person's location, the camera opens
on that city, and when it rests there, the Map asks for that area.

With the person's location, the Map opens on them. When the camera rests, the Map asks for the area
on screen together with 50 km around the person, snapped outward to a grid so the box does not give
away where in it the person is. It waits for the answer, and moves to the busiest city
only if no place is within 50 km. When any of the person's own places are shown, only those count,
and they count at once, because they all load together. An answer that comes after the first 3
seconds is ignored, and the camera stays on the person.

A change to the Discover places in view never moves the camera. Only the first framing and a filter
change do.

### Known limits

- **A wide view shows the oldest places.** It keeps the first 300 places added inside the box, so a
  city added later can show nothing until the person zooms in. Past 2,000 Discover places, a wide
  view never reaches the rest. A sample for each area, or the counts in phase 5, will replace this
  read.
- **The busiest city comes from the same sample.** A newer city with more places can lose the
  opening framing to an older one.
- **A dense narrow view can leave part of the screen empty.** In a box with more than 300 places, the
  index returns the first 300 that it finds, in its own order.
- **The opening check sees only what one answer holds.** It asks for 50 km around the person. The
  answer stops at 300 places or when a read budget runs out (two index calls of up to 1,024 rows, or
  2,000 rows for a wide box), before any distance test, so a nearer place can be left out. When the
  answer is not `complete` and the person has no saved place of their own on the Map, it stays on
  them rather than moving to the busiest city. A server query for the nearest Discover place within
  50 km would answer this directly.
- **Search covers only what is loaded.** The Map searches the person's own places and the Discover
  places of the area last in view. A name search over `places` on the server would find the rest.
- **An empty box over dense cells is untested.** The component stops after reading 1,024 rows, but it
  checks that count only when a row falls inside the box. A box with no Discover places, whose index
  cells hold more than about 4,000 points, could pass Convex's read limits and fail. No test holds
  that many points yet.

## Provider data

Decided on 2026-11-20: **Mapbox draws the map, Google gives a place's live details, and open data
is what we store.** Apple drops out once the Mapbox map ships.

**Until then we stay on Apple, decided the same day.** The app keeps Apple's map and Apple's place
data together, as it does today, which Apple's terms allow. The Mapbox map waits until open data
finds the places people save. A check of 20 well-known Lisbon places on 2026-11-20 found all 20 in
Apple's search and 17 in Overture; Overture missed Verride, Park and Prado. Overture's types were
finer (cocktail bar, tapas bar, seafood restaurant where Apple says Nightlife or Restaurant). Both
filed two hotel bars as hotels, which our own `kind` fixes.

While we stay on Apple, Apple's own place card (`modules/apple-place-card`,
`MKMapItemDetailViewController` on iOS 18 and later) shows Apple's live hours, photos and ratings
at no cost and within Apple's terms. "The card" below means it is shown when the place has an
`appleId` and the iPhone runs iOS 18 or later. What a tap opens:

- A person's own pin on the Map, and a place on a city page: the card, else the save.
- A Discover pin, a shared-list place and a trip stop (`stopAction` in `src/lib/trip-planner.ts`):
  the save when there is one, else the card, else Apple Maps. A Discover place has no save, so an
  older iPhone opens Apple Maps.
- A date-plan stop (`infoAction` in `src/lib/date-plan.ts`): the card, else the save, else Apple
  Maps.

So the place page in step 3 of "Order" is not needed yet. It becomes needed when the Mapbox map
replaces Apple; it would then replace the card in each of these paths.

**First version, decided the same day: no Google API call on the place page.** The page shows our
own data (name, type, kind, features, the save it came from) and an "Open in Google Maps" button.
The button is a [Maps URL](https://developers.google.com/maps/documentation/urls/get-started):
`https://www.google.com/maps/search/?api=1&query=<name, city>`, with `&query_place_id=<googlePlaceId>`
when the row has one, so it opens the exact place. Opening a link is not a Places API request: it
costs nothing and stores nothing, and the person sees hours, photos and reviews in Google Maps
itself. Live details on our own page, under rules 2 to 4 below, come later and only if people ask
for them, behind a monthly spending cap.

| Provider             | Used for                                       | May we store it?                         | May it sit on a Mapbox map? |
| -------------------- | ---------------------------------------------- | ---------------------------------------- | --------------------------- |
| Overture open places | Every pin: name, point, type                   | Yes                                      | Yes                         |
| Google Places (New)  | A place's page: photos, rating, hours, details | Only the place id; a point for 30 days   | No                          |
| Mapbox               | Drawing the map                                | Search results are temporary only        | Yes                         |
| Apple Maps (today)   | Today's lookups and map                        | Temporary only (DPLA Att. 6, §2.2, §2.5) | No: Apple maps only (§2.4)  |

Google's terms say "No use with a non-Google map"
([service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), §14.2) and allow
its content without a map ([Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)).
Mapbox's place search is "only available for temporary use"
([Search Box API](https://docs.mapbox.com/api/search/search-box/)). So the app keeps these rules:

1. **A pin never comes from Google.** Its name and point come from our `places` row, filled from
   open data. A Google point never places a pin, cached or not.
2. **Google's details show on a full-screen place page with no map on it.** Not in a sheet over the
   Mapbox map, and with no small map inside the page.
3. **Google's block is labelled and set apart.** The Google Maps logo sits beside it, each photo
   shows its author credit, the request asks for the place's `attributions` and the page shows
   any it returns, and our own name and type stay visibly separate from it.
4. **Only Google's place id is stored.** A row keeps an optional, indexed `googlePlaceId`. Photos,
   rating and hours are fetched when the page opens and never written to our database.
5. **The id comes from a checked search.** An import asks Text Search for each candidate's id, name
   and point (the Pro tier: $32 per 1,000, 5,000 free a month). It keeps an id only when exactly
   one candidate's name matches ours with its point within 100 m of our point. With none, or more
   than one, the row has no `googlePlaceId` and its page shows only our own data. The name and
   point are used for the check and never stored. A place is checked again only when its name or
   point changes, so the cost stays small. A search that fails, such as a timeout or an error from
   Google, decides nothing: the row is marked as still to check, and the next import or refresh
   runs the check again.

Google's key stays on the server: a Convex action fetches the details and returns them to the page.
For a place from a person's own save it checks `aiAllowed` first, like every other path that sends
a person's place to a third party. Its field mask asks only for what the page shows, because a call is billed at its most expensive
field. At list prices, one opened page costs about 2 to 3 cents after the free monthly amount:
Place Details with rating and hours is $20 per 1,000 (1,000 free), and a photo $7 per 1,000
(1,000 free) ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing), read
2026-11-20).

A refresh reads each new Overture release and updates the rows whose name, point or `sourceType`
changed. It never writes `type`, `kind` or `features`, which are ours. A change to a row's name or
point clears its `googlePlaceId` and runs the check above again. It patches a `places` row only when something changed, because a patch re-runs every query that
read the row.

**Points that came from Apple** are kept at most 30 days once the open-data match (step 2 under
"Order") exists. Apple's terms allow only temporary storage and name no number, so 30 days is our
own limit, the same as Google's limit for a cached point. Today nothing removes them, so a point
stored more than 30 days before the match's first run is kept longer than that. This is a known exception:
meeting the limit sooner means deleting every Apple point now, which would remove every saved pin
before there is anything to replace it with. The first run handles every
Apple point at once and is due as soon as it is built, by 31 December 2026 at the latest and before
the Mapbox map ships. After that it runs daily on every Apple point 29 days old or more, so a point
missed by one run is at most 30 days old at the next, since saves keep using Apple until the Mapbox
map ships. At cutover, the backend deploy that comes before the Mapbox
build's release stops every Apple lookup for every build, old ones included, and changes `withListPins`
(`model/placeList.ts`), which both `pinListPlaces` and `addPlaceListParts` use, to match each list place's Google point to an open-data point and store that point instead, the way
the import uses it only to find a match, so a list saved later never stores a Google point. The same deploy makes the mutations that write
a point (`placePins.storePins`, `withListPins` and any other) refuse an Apple or Google point. A
mutation always runs the deployed code, so a lookup that started before the deploy and finishes
after it is refused at the write, and no draining is needed. Then one last run
handles every remaining Apple or Google point whatever its age. The Mapbox build is released only after that
run finishes, so a Mapbox map never shows an Apple or Google point. It replaces each `places` row's
point with Overture's, and deletes a row with no match together with its index entry, so no Apple
point stays behind. It also re-points each saved place to its open-data match and drops the Apple
point of one with no match, keeping its name and city; the place then shows in lists but not as a
pin until the person sets a point. The pass does the same to every other copy of a point:
`tripStops`, `sharedListPlaces`, `placeVisits`, `placeRemovals` and place corrections. Each copy is
re-pointed to its open-data match; a copy with no match keeps its name and city and loses its
point, and a visit or removal then matches by name and city only. Every point stored today came from a provider,
so the pass treats all of them alike and needs no rule to tell them apart: a pin has no origin
field and `appleId` is optional, but no point was set by a person. Most come from Apple: the
automatic lookups, and a correction, which searches Apple Maps (`placeCorrectionSearch`). The rest come
from a Google Maps list: its reader (`model/readers/googleMaps.ts`) gives each place Google's
point, and `withListPins` copies that point into the save's pins (for the first city through
`pinListPlaces`, for the rest through `addPlaceListParts`), even when the pin also carries
an `appleId`. `placesImport:importGoogleMapsList` is different: it uses Google's point only to find
an Apple match and stores Apple's point in the `places` row. Those list pins get the same pass and
the same 30-day limit. Google's 30-day allowance covers its API results, not points read from a
list page, so whether list points may be kept at all is for the owner to confirm with Google or
counsel before the first pass. Once the Mapbox map lets
a person pick a point from open data or drop one, each pin records where its point came from, and a
point the person set that way stays. Until the pass runs,
these tables, `items.placePins` and the `places` rows still hold Apple points.

This reads the published terms; it is not legal advice. Before the place page ships, ask Google to
confirm rules 1 and 2 in writing.

## Counts

A save appends an entry to a queue. A scheduled job folds the queue into `placeStats` in batches, so
no row is written by every save. The job updates a place's Discover sort order only when its count
moves enough to change the order. "Saved by N people" shows only above a minimum count, so a count
never points at one person.

## The earlier objections

"The larger design, and why not now" in [places.md](places.md) rejected a shared catalog for eight
reasons. Each one is a constraint on this design:

| Objection                                       | Answer                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. The catalog would hold personal data         | Rule 1. `places` takes only provider data and our curation.                                                  |
| 2. One city per person per place is wrong       | The city lives on each `savedPlaces` row, per save.                                                          |
| 3. One removal time loses today's removal rules | `placeRemovals` and its matching stay. The `places` link becomes one more way to match.                      |
| 4. Unmatched places have no safe identity       | An unmatched place has no `places` row, only a `savedPlaces` row without a link.                             |
| 5. The rollout has two sources of truth         | Readers move first, then `placePins` is emptied and dropped. Few people use the app, so the window is short. |
| 6. Every save writes a popular place's row      | Rule 3, and counts come from a scheduled job.                                                                |
| 7. The first model guess becomes everyone's     | The model's category and cuisine stay on `savedPlaces`. `places` takes the provider's category.              |
| 8. Late writes after the account deletion drain | Rule 7.                                                                                                      |

## Open questions

- **How "We went" matches.** A visit matches today by normalized name and a nearby point. If one
  save of a venue is matched and another is not, a visit must not split in two, and a place that
  gains a match later must keep its visit. The plan is to keep today's matching and add the `places`
  link as one more match. The merge rule is not designed yet.
- **Apple's daily quota.** Saves share it until the Mapbox map ships and Apple drops out.

## Phases

1. **Hand-picked Discover places (PR #789, merged).** `places`, the two imports, and `forMap`
   returning up to 3,000 live rows (`MAX_MAP_PLACES`).
2. **Discover by area.** The geospatial index and `inArea({ box })`, which the Map reads.
   `forMap({})` keeps its arguments for the phase 1 client.
3. **`savedPlaces`.** Copy every save's pins into it. Saving writes it and adds or links `places`
   rows. The Map reads it.
4. **Everything else moves.** City pages, trips, shared lists, visits, removals and corrections
   read `savedPlaces` and `places`. Then `placePins` is emptied and its declaration dropped.
5. **Counts.** `placeStats`, "Saved by N people", and Discover sorted by them. This replaces step 1
   of [the social Map plan](../plans/social-map.md).
6. **Provider refresh,** and a second provider when one is needed.

## Search catalog import

Download a bounded city area from the official Overture places release. Prepare a batch file and inspect it before any database write.

```sh
overturemaps download --bbox=-122.4105,37.7827,-122.4050,37.7880 -f geojson --type=place -o /tmp/shelvr-venues.geojson
node tools/prepare-catalog-import.mjs /tmp/shelvr-venues.geojson 'San Francisco' > /tmp/shelvr-catalog-batches.jsonl
```

Each line can be passed as JSON arguments to the internal `places:storeCatalog` mutation through `convex run` from `apps/native`, using an explicitly selected deployment. The importer accepts open venues in the named locality with a supported category and recognized license. It emits public venue facts and stable IDs only. Search-only imports are separate from the editor-picked Discover feed. Keep the [Overture Places attributions and license notices](https://docs.overturemaps.org/attribution/#places) with the dataset.
