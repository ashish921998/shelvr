# Save a link

Paste a URL; the backend reads the page (`convex/model/pageRead.ts`) and the
model titles it, and the save lands on Home as an article.

## Sub-features

- Add > Article opens a URL field and Save.
- The card shows as processing ("Still working on it"), then ready with a
  title, source domain, and image.
- "Paste a link" on Home saves a URL that is on the clipboard.

## How to get to it (user POV)

Home, `Add`, the Article option. Needs Pro (seeded).

## Driving it with e2e

`tests/save-link.e2e.ts`: `screen.getByTestId("add-option-article")`,
`screen.getByTestId("add-article-input")`, `screen.getByRole("button", "Save")`,
then one `agent.waitFor` with `vision: "only"` to read the card. Needs
`GOOGLE_GENERATIVE_AI_API_KEY`.

## Proof

The model judges, from a screenshot, that Home shows exactly one finished save
about the saved page (`https://en.wikipedia.org/wiki/Sourdough`). The test does
not check that the seeded saves remain or that no other card is processing;
look at the screen for that. The row is an `items` row of type link on the dev
deployment.

## Charters

```
link-flow|ios|skeptic|From the seeded Home, save a Wikipedia link through Add > Article and watch the card finish; check its title, source, and image against the page
link-input|ios|fuzzer|From the seeded Home, save through Add > Article a URL without a scheme, a non-URL, a URL with tracking parameters, and the same URL twice; report what is saved and how
```

## Gotchas

- The page read and the title take up to two minutes on the dev deployment;
  the wait is 120 seconds.
- "Paste a link" does nothing without a URL on the device clipboard
  (`printf '%s' '<url>' | xcrun simctl pbcopy <udid>`).
