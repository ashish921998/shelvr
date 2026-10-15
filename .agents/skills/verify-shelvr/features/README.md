# Feature map

One file per core feature of the Shelvr iOS app, from the user's point of
view. Each names the test that pins it, the locators that matter, the proof,
and its bug-bash charters. Every test starts on the seeded Home
(`startOnSeededHome` in `tools/e2e/tests/seeded-home.ts`). Not mapped yet:
Tidy, Map, item detail editing, sharing, onboarding, settings,
notifications. Map them when a change touches them.

| Feature                           | Where                                       | Test                                                    | Status                                     |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| [Save a link](save-link.md)       | Home > Add > Article                        | `tests/save-link.e2e.ts`                                | tested (needs a model key)                 |
| [Save a note](save-note.md)       | Home > Add > Note                           | `tests/save-note.e2e.ts`                                | tested                                     |
| [Save a photo](save-photo.md)     | Home > Add > Photos                         | `tests/save-image.e2e.ts`                               | tested (iPhone 17 only, needs a model key) |
| [Search](search.md)               | Search tab                                  | `tests/search.e2e.ts`, `tests/search-no-results.e2e.ts` | tested                                     |
| [Create a space](create-space.md) | Spaces tab > New space                      | `tests/create-space.e2e.ts`                             | tested                                     |
| [Paywall](paywall.md)             | Home > Add or "View Pro plans", without Pro | `tests/paywall.e2e.ts`                                  | tested                                     |

`tests/smoke.e2e.ts` is the Doctor, not a feature. The `e2e ios` workflow
(`.github/workflows/e2e-ios.yml`) runs search, search-no-results,
create-space and the paywall on pull requests that touch the app, against a
local Convex backend with no model; the save flows need the model and run by
hand.
