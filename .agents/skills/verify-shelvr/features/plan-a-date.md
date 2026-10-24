# Plan a date

The core flow: a saved Reel or page names places, the save lands under its
city on Home, and the city page plans a date from those places.

## How to get to it (user POV)

Home, `Add`, paste a link that names places in a city. Tap that city's card,
then `Plan a date`. Needs Pro (seeded).

## Driving it with e2e

`tests/plan-city-date.e2e.ts` runs in the `e2e ios` CI job and skips
elsewhere. It saves the fixture page `/lisbon-date-night` from
`convex/model/fakeAi.ts`. The fake model reads Lisbon and three places off
it, and answers the plan call with every place the saves list, in order.
Locators: the city card is a button labelled `Lisbon, N spots`; the plan
button is `Plan a date`; the plan screen says `Your shortlist`, and each card
is a button whose label starts with the place name.

The backend half also runs in Vitest, with no simulator:
`convex/aiFakeModel.test.ts` ("from a saved page to a date plan").

## Proof

The Lisbon page lists "Date night in Lisbon", and the shortlist's first card
is "Taberna da Rua das Flores". The CI backend has no Apple Maps key, so the
city map shows no pins.
