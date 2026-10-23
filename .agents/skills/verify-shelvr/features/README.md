# Feature map

One file per core feature of the Shelvr iOS app, from the user's point of
view. Each names the test that pins it, the locators that matter, the proof,
and its bug-bash charters. Every test but onboarding starts on the seeded
Home (`startOnSeededHome` in `tools/e2e/tests/seeded-home.ts`); onboarding
launches as a fresh install (`-E2EFreshInstall YES`) and starts at "Start yours". Not mapped yet:
Map, link and photo pages, sharing, settings, notifications. Map them when a change touches them.

| Feature                           | Where                                       | Test                                                          | Status                                     |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| [Save a link](save-link.md)       | Home > Add > Article                        | `tests/save-link.e2e.ts`, `tests/save-link-fixture.e2e.ts`    | tested (real page: model key; fixture: CI) |
| [Save a note](save-note.md)       | Home > Add > Note                           | `tests/save-note.e2e.ts`                                      | tested                                     |
| [Save a photo](save-photo.md)     | Home > Add > Photos                         | `tests/save-image.e2e.ts`                                     | tested (iPhone 17 only, needs a model key) |
| [Search](search.md)               | Search tab                                  | `tests/search.e2e.ts`, `tests/search-no-results.e2e.ts`       | tested                                     |
| [Create a space](create-space.md) | Spaces tab > New space                      | `tests/create-space.e2e.ts`, `tests/space-suggestions.e2e.ts` | tested (suggestions: CI)                   |
| [Paywall](paywall.md)             | Home > Add or "View Pro plans", without Pro | `tests/paywall.e2e.ts`                                        | tested                                     |
| [Onboarding](onboarding.md)       | Fresh install > Start yours                 | `tests/onboarding.e2e.ts`                                     | tested                                     |
| [Item detail](item-detail.md)     | Home > tap a save                           | `tests/item-detail.e2e.ts`                                    | tested (notes only)                        |

`tests/smoke.e2e.ts` is the Doctor, not a feature. The `e2e ios` workflow
(`.github/workflows/e2e-ios.yml`) runs search, search-no-results,
create-space, item-detail, the paywall, onboarding, save-note, save-link-fixture and
space-suggestions on main and on pull requests
that touch the app and carry the `run-e2e` label, split over two runners, against a local Convex backend that runs the fake model
in `apps/native/convex/model/fakeAi.ts`. The real-page link save and the
photo save need the model and run by hand.
