# Feature map

One file per core feature of the Shelvr iOS app, from the user's point of
view. Each names the test that pins it, the locators that matter, the proof,
and its bug-bash charters. Every test but onboarding starts on the seeded
Home (`startOnSeededHome` in `tools/e2e/tests/seeded-home.ts`); onboarding
launches as a fresh install (`-E2EFreshInstall YES`) and starts at "Get started". Not mapped yet:
The city page, plans and trips, item pages, sharing, settings, notifications. Map them when a change touches them.

| Feature                     | Where                                       | Test                                                       | Status                                     |
| --------------------------- | ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| [Save a link](save-link.md) | Home > Add                                  | `tests/save-link.e2e.ts`, `tests/save-link-fixture.e2e.ts` | tested (real page: model key; fixture: CI) |
| [Paywall](paywall.md)       | Home > Add or "View Pro plans", without Pro | `tests/paywall.e2e.ts`                                     | tested                                     |
| [Onboarding](onboarding.md) | Fresh install > Get started                 | `tests/onboarding.e2e.ts`                                  | tested                                     |

`tests/home-cities.e2e.ts` is the Doctor, not a feature: it checks Home lists
"Your cities" with a Lisbon card. The `e2e ios` workflow
(`.github/workflows/e2e-ios.yml`) runs home-cities and onboarding (shard a),
the paywall and save-link-fixture (shard b) on main and on pull requests
that touch the app and carry the `run-e2e` label, against a local Convex backend that runs the fake model
in `apps/native/convex/model/fakeAi.ts`. The real-page link save needs the
model and runs by hand.
