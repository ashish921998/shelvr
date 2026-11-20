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

So the open type is a starting point, and a type we set by hand wins. Each type maps to one kind
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

A type also gives the pin's emoji (`pizza_restaurant` 🍕, `wine_bar` 🍷), which replaces most of
today's guessing from the cuisine and the name.

The type is stored as a plain string, not a fixed list, so a new or renamed Overture category never
fails a deploy (see "A table field is a one-way door" in `CLAUDE.md`). Code keeps a list of the
types we show, about 60, each with a label in every language. A type outside that list shows only
its kind.

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
2. Store an Overture id and type on `places`, matched at import. Move the stored point to Overture.
3. The type list, its labels in every language, and pin emoji from the type.
4. Type and features from the classifier for saves.
5. The second row of chips on the Map, and the type and features on a place's detail.

### Open questions

- **Overture attribution.** What the app must show when it uses Overture data.
- **Matching** an Overture place to an Apple id for the same venue, and what to do when they
  disagree on the point.
- **Which 60 types.** The Lisbon counts above are a first cut; a second city should confirm them.

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

Apple says that MapKit place ids are unique and stay valid over time, and Apple's own sample code
stores them ([WWDC25 session 204](https://developer.apple.com/videos/play/wwdc2025/204?time=45),
[Interacting with nearby points of interest](https://developer.apple.com/tutorials/data/documentation/mapkit/interacting-with-nearby-points-of-interest.md)).
The Apple Maps Server API looks places up by id, one at a time or in batches, and maps an id that
changed to its new id ([Apple Maps Server API](https://developer.apple.com/documentation/applemapsserverapi.md)).
Google exempts its place ids from its caching limits
([Places SDK policies](https://developers.google.com/maps/documentation/places/ios-sdk/policies)).

Apple's developer agreement allows only temporary storage of its place data and no database built
from it (DPLA Attachment 6, §2.2 and §2.5). Keeping the id and refreshing the rest is not enough:
the stored name and point should come from a provider whose data we may keep. Overture's open
places can be kept; see "Labels" above.

- The refresh job fetches stale rows by id. It refreshes only rows that people view, because saves,
  imports and refreshes share one daily Apple quota.
- Refresh bookkeeping lives in its own table. The job patches a `places` row only when the
  provider's data changed, because a patch re-runs every query that read the row.
- A second provider (Mapbox, Google, Foursquare) is one more optional, indexed id field.

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
- **Apple's terms** on keeping a place's name and point: storage must be temporary. See "Provider data".
- **Apple's daily quota.** Saves, imports and refreshes share it.

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
