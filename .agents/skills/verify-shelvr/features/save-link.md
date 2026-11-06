# Save a link

Paste a URL; the backend reads the page (`convex/model/pageRead.ts`) and the
model titles it. The save lands under its city on Cities, or under
Home's Without a place row when the page names no place.

## Sub-features

- The tab bar's Add button opens Add spots; its Paste a link card opens a sheet
  with one URL field (`add-article-input`) and Save.
- A Reel or TikTok link is the main case; any page link is accepted.
- While it runs the save shows under Recents as "Finding places…"; a save with
  no place moves to Without a place when ready, and so does a failed one.

## How to get to it (user POV)

`Add`, `Paste a link`, paste the link. Needs Pro (seeded).

## Driving it with e2e

`tests/save-link-fixture.e2e.ts` runs in the `e2e ios` CI job with no
model and no network read: it saves a fixture page from
`convex/model/fakeAi.ts` and checks the save appears under Without a place.
Elsewhere it skips.

`tests/save-link.e2e.ts`: `openAddSheet` (taps Add, then Paste a link, returns the
`add-article-input` field), `screen.getByRole("button", "Save")`, then it
checks the same Without a place result for a real page. Needs
`GOOGLE_GENERATIVE_AI_API_KEY`.

## Proof

Home shows a Without a place row whose sheet lists the saved page
(`https://en.wikipedia.org/wiki/Sourdough`, which names no place). The
test does not check that the seeded cities remain; look at the screen for that.
The row is an `items` row of type link on the dev deployment.

## Charters

```
link-flow|ios|skeptic|From the seeded Home, save a Wikipedia link through Add and watch it appear under Without a place; check its title and source against the page
link-input|ios|fuzzer|From the seeded Home, save through Add a URL without a scheme, a non-URL, a URL with tracking parameters, and the same URL twice; report what is saved and how
```

## Gotchas

- The page read and the title take up to two minutes on the dev deployment;
  the wait is 120 seconds.
