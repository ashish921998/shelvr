# Been cities

The cities someone has been to, picked from photo tiles of the 25 sample
cities, show on the Map tab with a check mark, so a new account's map is not
empty. Profile shows how many there are and opens the editor.

## Sub-features

- Profile has a "Cities you’ve been to" row whose value is "None yet", "1
  city" or "N cities". It hides at the plan gate and while the plan loads.
- The editor (the row, or the Map tab) lists every city as a checkbox tile
  with a "Search cities" field. Each tap saves at once; a failed save takes
  the tick back and says "Couldn’t update your cities".
- With no places and no Been cities, the Map's empty state has "Add cities
  you’ve been to". With no places and some Been cities, the Map shows them
  under a "Been to N cities" card with **Edit**, in place of search and
  filters.
- With places, the Map adds a check mark for each Been city that has no
  saved place within 50 km, and hides them while a filter or search is on.

## How to get to it (user POV)

Home > Profile > Cities you’ve been to. The seeded account has been to
Austin, Lisbon and Madrid.

## Driving it with e2e

`tests/been-cities.e2e.ts`, no model. It opens Profile with
`screen.getByRole("button", "Profile")` and waits for the button
`Cities you’ve been to, 3 cities` (`profile-been-cities`; its label carries
the value). In the editor each tile is a checkbox named by the city
(`been-city-<id>`, for example `getByRole("checkbox", "Madrid")`); Close is
the button named `Close`. The Map card's **Edit** is `map-been-edit`, and the
empty state's button is `map-add-been`.

## Proof

Madrid's checkbox passes `toBeChecked()`, a tap makes it pass
`toBeChecked({ checked: false })`, and after Close the Profile row reads
`Cities you’ve been to, 2 cities`. The rows are in the `beenCities` table on
the dev deployment.

## Charters

```
been-search|ios|skeptic|With the app in French, open Profile > Villes visitées and search "montreal", "copenhagen" and "zzz"; check Montréal, Copenhague and the no-match line show
been-looks|ios|skeptic|In dark theme and at the largest text size, open the Been editor from Profile and the Map card; check tiles, ticks, the card and Edit stay readable and nothing is clipped
been-map|ios|skeptic|On an account with no places, pick Been cities with location allowed and with it denied; check the Map opens on the Been group under the card, and moves when the editor adds a far city
```

## Gotchas

- The seeded Home already has places, so the Map is in the mixed state: Been
  cities with a seeded place nearby show no check mark. A Been-only map needs
  an account with no saves.
- Each seeded test resets the fixtures, which puts Austin, Lisbon and Madrid
  back.
