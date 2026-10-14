# Save a photo

Pick a photo from the library; it uploads through the three-step image import
and the model describes it.

## Sub-features

- Add > Photos opens the system photo picker.
- One picked photo uploads and shows as processing, then ready.
- A failed photo shows "Couldn't read photo", "Photo too large", or
  "Photo unavailable".

## How to get to it (user POV)

Home, `Add`, the Photos option. Needs Pro (seeded) and photo library access.

## Driving it with e2e

`tests/save-image.e2e.ts` adds `tools/e2e/fixtures/photo.png` to the library
with `xcrun simctl addmedia`, then `chooseAddOption` with
`screen.getByRole("button", /Photos$/)`. The picker is outside the
accessibility tree, so its first photo and confirm tick are tapped by position
(`screen.tapAt`) and checked with `agent.waitFor` (`vision: "only"`). Needs
`GOOGLE_GENERATIVE_AI_API_KEY`.

## Proof

Home shows five saves, the new one the orange "E2E PHOTO" picture, and no
card is processing or failed. The upload is a storage file plus an `items`
row of type image on the dev deployment.

## Charters

```
photo-flow|ios|skeptic|From the seeded Home, save one photo through Add > Photos and watch it finish; check the card, its title, and that only one photo was saved
```

## Gotchas

- The tap positions are measured on a 402 x 874 point screen (iPhone 17). The
  test stops on any other size instead of tapping somewhere unmeasured.
- Every run adds another copy of the fixture to the simulator's library.
