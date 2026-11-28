# Let people check the places a save found

Status: steps 1 and 2 built on `claude/post-import-review` (2026-11-28), without the server event
`place_correction_saved`. Written 2026-11-27, from the Rodeo teardown in `shelvr-notes`
(`reports/Rodeo app feature teardown.md`).

## Problem

A save can find the wrong place, or miss one, and the person rarely finds out. After a link share,
`src/app/(app)/spots/[id].tsx` reveals the places found ("N spots from this save"), but each row is
read-only. Fixing a place means opening the save, finding the Pro-gated "Edit places" link
(`src/components/item-detail.tsx:512`), and working in `edit-save-places.tsx`. Only outright
failures surface on their own (`unplaced-toast.tsx`, `review-saves.tsx`).

So we also have no measure of extraction quality. `item_processed` (`convex/analytics.ts:208`) has
no place count, and no event fires when a place is removed or corrected. Today the only signals
are `captureError("place_correction_save_failed")` and its siblings.

Rodeo ends every import on "What we found": one row per item, a ✕ on each, 👍/👎, and "Anything
missing?". Its reviewers complain mostly about wrong dates and places, and that screen is where the
complaints get fixed. We already have the screen; it just can't correct anything.

## Goal

On the reveal after a link save, the person can remove a wrong place in one tap and reach "add a
missed place" in one more. Every reveal tells us whether the places were accepted as found.

Not goals: a new screen, 👍/👎 buttons, review for Siri saves (the app is closed when they land),
or changing what a removal means on the city page.

## Design

### 1. Each spot row gets a remove control

`SpotRow` in `spots/[id].tsx` gains a trailing ✕ (44 pt hit target, label "Remove {name} from this
save"). It appears once every pin has dropped (`dropped === pins.length`), so nobody taps a moving
row.

Tapping it takes the row and its pin off the screen and updates the title count. A 6 s toast reads
"Removed {name}" with Undo, like the city page's toast (`src/lib/place-removal.ts:21`). Removing
the last place shows "No places left in this save" with Done.

**Removals are staged on the screen and written once,** when the person leaves the reveal (Done,
"Open {city}", "Wrong or missing a place?", or back). That makes Undo local, with no server round
trip. One write per reveal also avoids the version race below. If the app is killed before the
write, the staged removal is lost. That is acceptable for a one-tap correction.

**A removal here applies to this save only.** It goes through `placeCorrections.savePlaces`, not
`placeRemovals.removePlace`. `removePlace` hides the place in every save the person ever made
(`convex/model/placeRemovals.ts:72`) and stores no `itemId`. That suits the city page, but on a
single save it would surprise the person.

**"Also add to" writes first.** Ticking a shared list copies the save's places at once
(`sharedLists.addSavePlaces`), so the reveal writes staged removals before the toggle. A place
removed after the tick stays on the shared list, as rows outlive saves.

### 2. "Wrong or missing a place?" opens Edit places

There is a quiet text button under the rows, above `AlsoAddTo`. It writes any staged removals, then
pushes `/edit-save-places?itemId=` (Replace, Add and Remove already live there). The existing
`useProGate("edit_places")` still applies. The tap is logged before the gate, so free users' "wrong"
signals count too.

### 3. A remove-only path in `savePlaces`

`savePlaces` was built for full edits, and its patch (`convex/placeCorrections.ts:146-160`) does
more than a ✕ should:

- it sets `placesEdited: true`;
- it clears `placeCuisines`;
- it drops every `open_maps` intent;
- it rebuilds pins from the edit form's fields, which carry no cuisine.

So one ✕ through today's code would strip cuisine labels and map links from the places the person
kept.

When the new list is the current list with places removed (same order, no add, no replace),
`savePlaces` takes a narrower branch:

- **Filtered, not rebuilt:** `placePins`, `places`, `placeLocations` and `cities` are filtered to
  the kept places.
- **Cuisines:** `placeCuisines` is filtered to the kept places, not cleared.
- **Map links:** `open_maps` intents are kept for kept names and dropped for removed ones.
- **Edited flag:** `placesEdited: true` is still set. It means "the owner chose this list": from
  then on, `storePins` only adds pins beside the owner's (`convex/placePins.ts:376`), and list pins
  skip the save (`convex/items.ts:2320`). That is the right meaning after a removal.
- **No new lookups:** it schedules `locateItem` only if unpinned places remain, as today. A
  removal never starts a new search.
- **Exactly the list sent:** the server keeps every entry the request names. Edit places sends
  every row the person kept, so it can't tell a label they chose to keep from one tied to a
  removed pin.
- **Labels go with their pin, on the reveal:** the reveal client also leaves out an unpinned label
  for a removed pin ("Lucy's, Montrose" after removing the pin "Lucy's"), or `locateItem` would
  look it up again. It matches the name, and the area when the pin has one, so removing
  "Joe's, Carmine St" keeps "Joe's, Broadway". When the pin has no area, the label must be in
  the pin's city, so a multi-city save keeps "Taco Bar, Dallas". Also add to writes these removals
  before a toggle and skips the toggle if the write fails.

**Free users may remove, not add.** Saving is free under `FREE_SAVES_ENABLED`, but every correction
needs Pro today (`requireProEntitlement` at `convex/placeCorrections.ts:121`). A free user who sees
a wrong place right after saving it can only live with it. The remove-only branch skips the Pro
check. Add and Replace stay Pro, and so does the city page's account-wide removal. The Pro check
now runs after the version check, because only then is the list known to be a removal.

The `version` check, the `status === "ready"` check and the `tripEdit` rate limit are unchanged.
Because `args` and `returns` stay the same, `tools/verify-convex-api.mjs` sees no contract change,
and old clients' full edits behave as before.

**Decided 2026-11-27: free users may remove.** It fixes trust at the moment a free user is deciding
whether Shelvr works. The client's ✕ therefore skips `useProGate`, while "Wrong or missing a
place?" still goes through `useProGate("edit_places")`.

### 4. The Add sheet reveals too (optional)

`add.tsx:121` discards the id that `createLinkItem` returns and closes the sheet. Routing that id to
`/spots/[id]`, the way share's `afterSave` does (`share.tsx:534`), gives pasted links the same
reveal and corrections.

The trade-off: today the sheet closes at once. With the reveal, the person waits on "Finding
spots…" for up to 35 s (25 s for ready plus 10 s for pins, `src/lib/spots-reveal.ts:4-5`), and a
save with no place sends them to the Map. Ship it only if the share reveal's numbers show people use
the corrections. Photo and note shares keep going Home.

### 5. The signal

Client events, added to `AnalyticsEventProperties` in `src/lib/analytics.ts` next to
`share_spots_*`:

| Event                        | Properties                                                 | Fires when                                                 |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `share_spots_place_removed`  | `pin_count`                                                | A ✕ is tapped                                              |
| `share_spots_place_restored` | `pin_count`                                                | Undo is tapped                                             |
| `share_spots_fix_opened`     | `pin_count`, `staged_removals`                             | "Wrong or missing a place?" is tapped, before the Pro gate |
| `share_spots_left`           | `pin_count`, `removed`, `via: done \| city \| fix \| back` | The person leaves a reveal                                 |

Server event `place_correction_saved` from `savePlaces`, with `source` (`spots` or `edit`, passed by
the client as an optional arg), `before`, `after`, `added`, `removed` and `pro`. This one is
counts only: no place names, which are user content (`logEvent` and analytics rules). An optional
`source` arg widens the public args, so it needs the `Convex-Api: changed` trailer. Drop it if the
client events are enough.

**The number to watch:** the share of reveals left with `removed = 0` and no fix tap. Treat it as an
upper bound on acceptance, for two reasons: it counts people who tapped Done without looking, and
it covers only the places the reveal shows (pinned places in the main city). Its complement, broken
down by `save_source` and by `share_spots_revealed.pin_count`, shows where reading goes wrong.

### Matching a reveal row to a saved place

The reveal shows a filtered view: pinned places in the main city, without street-address names
(`revealFor`, `src/lib/spots-reveal.ts:43`). `savePlaces` takes the full list from `getPlaces`.
A staged removal is matched to a `getPlaces` entry by `appleId` when both have one, else by name
plus coordinates. Entries the reveal didn't show are always kept. This matching is the pure
function the client unit test covers.

### Races with late pins

`finalizeItem` sets `ready` before `placePins.locateItem` adds pins (`convex/items.ts:2262`). The ✕
appears when the drop animation ends, which is not when pinning ends. Two things can happen while
the reveal is open; `docs/architecture/state-machines.md` covers the lease and run patterns
involved.

- **The list changes before the write.** `savePlaces` rejects a stale `version` ("Places changed;
  reopen this save"). The reveal subscribes to `api.placeCorrections.getPlaces` for `version`. On
  leaving, it applies the staged removals to the latest list and writes once. If the write still
  hits a mismatch, it retries once against a fresh list, then gives up with
  `captureError("spots_removal_failed")`. It never blocks navigation.
- **A pin lands after the write.** `storePins` is guarded by its own version (run id plus cities,
  `convex/placePins.ts:199`), and it keeps only wanted places (`wantedPlaces`, `placePins.ts:150`).
  Because the remove-only branch sets `placesEdited`, the wanted list is just the save's rewritten
  `places` (`placePins.ts:154`). Without the flag, `wantedPlaces` would re-read every source, which
  could bring a removed place back. So a late lookup cannot revive a removal, while pins for kept
  places still land beside the owner's. A Convex
  test pins this down: remove a place, then run `storePins` with a found pin for it, and the pin
  must not return.

## Steps

**Smallest version that ships alone:** the ✕ with staged removals, free removal, the fix link, and
the client events. The server event and the Add sheet can each follow separately.

1. **Server:** the remove-only branch in `savePlaces` with its free exemption, and
   `place_correction_saved`. Tests in `convex/placeCorrections.test.ts`:
   - a remove-only edit keeps cuisines and kept `open_maps` intents;
   - a free user can remove;
   - a free user cannot add, replace or reorder;
   - a Pro full edit is unchanged;
   - a stale version is rejected;
   - a late `storePins` cannot bring a removed place back.

   Deploy first (backend first).

2. **Client, reveal:** the ✕, staged removals with Undo, the leave-time write, the fix link, the
   events and the copy. The staging (current list plus staged removals gives the list to save) is a
   pure function with a unit test. Copy goes in `src/locales/en.json`, then run
   `pnpm localization:generate`. Ships by OTA; no native change, so the fingerprint doesn't move.
3. **Client, Add sheet (optional, later):** route the returned id to `/spots/[id]`, once step 2's
   numbers justify the wait it adds.
4. **Verify** on the simulator with `.agents/skills/verify-shelvr` and `E2E_FAKE_AI`:
   - a multi-place link save: remove one, undo, remove again, Done;
   - check the city page and the save's Edit places list no longer show the removed place (item
     detail has no list of places);
   - repeat as a free user;
   - repeat through the Add sheet.

   The PR embeds a recording.

## Open questions

1. **No places found.** Today `revealFor` returns `none` for a `no_place` save, and the reveal
   silently replaces itself with the Map while `unplaced-toast` says "Couldn't find places in that
   link". Should the reveal instead say so in place and offer "Add the place"? Check the
   `share_spots_skipped` `reason = no_place` share first. If it is small, leave it.
2. **Other cities.** `revealFor` keeps only the city with the most pins
   (`src/lib/spots-reveal.ts:43`), so a save with places in two cities reveals one. A line such as
   "Also 2 in Paris" that opens Edit places would make the review complete. Is that worth it in the
   first version?
