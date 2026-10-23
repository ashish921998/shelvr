# Search

Full-text search over the user's saves from the Search tab.

## Sub-features

- Typing in `Search your saves` queries the backend (debounced).
- Matching saves show; the rest hide.
- No match shows "Nothing found".

## How to get to it (user POV)

The `Search` tab. Any signed-in user.

## Driving it with e2e

`tests/search.e2e.ts` and `tests/search-no-results.e2e.ts`, no model.
Locators: `screen.getByRole("tab", "Search")`,
`screen.getByRole("textbox", "Search your saves")`,
`screen.getByTestId("fixture-item-<slug>")`, `screen.getByText("Nothing found")`.

## Proof

`ramen` shows `fixture-item-ramen` and hides the other three seeded saves;
`zzyzxq` shows "Nothing found" and no seeded save. The query runs against the
`search_text` index on the dev deployment, so a pass proves the round trip.

## Charters

```
search-flow|ios|skeptic|From the seeded Home, search for words from each seeded save's title, tags, and body, then clear the search; check every result list against the four saves
search-input|ios|fuzzer|From the seeded Home, search with one letter, punctuation only, mixed case, accented letters, and 200 characters; report errors, stale results, or a frozen screen
```

## Gotchas

- Results arrive after a debounce and a backend round trip; wait on the
  result, not a fixed delay.
