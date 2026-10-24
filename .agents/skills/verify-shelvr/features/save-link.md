# Save a link

Paste a URL; the backend reads the page (`convex/model/pageRead.ts`) and the
model titles it. The save lands on Home under its city, or under
"No place found" when the page names no place.

## Sub-features

- Home's Add button opens a sheet with one URL field (`add-article-input`) and Save.
- A Reel or TikTok link is the main case; any page link is accepted.
- While it runs the save shows under "No place found" as processing; a save
  with no place stays there when ready, and a failed one stays there as failed.

## How to get to it (user POV)

Home, `Add`, paste the link. Needs Pro (seeded).

## Driving it with e2e

`tests/save-link-fixture.e2e.ts` runs in the `e2e ios` CI job with no
model and no network read: it saves a fixture page from
`convex/model/fakeAi.ts` and checks the save appears under "No place found".
Elsewhere it skips.

`tests/save-link.e2e.ts`: `openAddSheet` (taps Add, returns the
`add-article-input` field), `screen.getByRole("button", "Save")`, then it
checks the same "No place found" result for a real page. Needs
`GOOGLE_GENERATIVE_AI_API_KEY`.

## Proof

Home shows a "No place found" section holding exactly one save for the saved
page (`https://en.wikipedia.org/wiki/Sourdough`, which names no place). The
test does not check that the seeded cities remain; look at the screen for that.
The row is an `items` row of type link on the dev deployment.

## Charters

```
link-flow|ios|skeptic|From the seeded Home, save a Wikipedia link through Add and watch it appear under No place found; check its title and source against the page
link-input|ios|fuzzer|From the seeded Home, save through Add a URL without a scheme, a non-URL, a URL with tracking parameters, and the same URL twice; report what is saved and how
```

## Gotchas

- The page read and the title take up to two minutes on the dev deployment;
  the wait is 120 seconds.
