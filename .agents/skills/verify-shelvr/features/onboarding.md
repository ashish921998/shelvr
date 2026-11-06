# Onboarding

A new account answers a few short questions, picks a city, saves a sample
reel through a drawn share sheet, sees its spots on a map and three slides,
is asked about reminders, then meets the paywall. This is flow 25:
`ONBOARDING_FLOW_VERSION` and the step order (`ONBOARDING_STEPS`) are in
`src/lib/onboarding-steps.ts`. The opener is three pages that swipe (on
their own until a swipe, never with Reduce Motion), each with "Get started"
and an "Already have an account? Sign in" link for returning people; a new
account stays signed out through the paywall and signs in after it.

## Sub-features

- "Get started" opens "How many places have you saved?", then "What would
  you like to plan?" (checkboxes `Date nights`, `Trips`, `Places to eat`,
  `A bit of everything`). Goals that include `Trips` add "Are you planning
  a trip soon?", which moves on at one tap (`Yes, I’m planning one`,
  `Not yet`). Then "How do you like to plan?", "Where have you been?" and a
  chart, "Let’s put your saves to use." The count, goal, planner and Been
  questions have Continue (disabled until an answer) and "Skip" in the
  header; a skipped goal question plans for every goal, so the trip
  question follows. Every step after the opener has a back button.
- "Where have you been?" shows the 25 sample cities as checkbox tiles named
  by city (`been-city-<id>`), with a "Search cities" field; a tile tap
  closes the keyboard, and a second tap takes the tick off. Its Continue
  (`onboarding-been-continue`) stays disabled until a city is ticked, and
  "Skip" moves on with none. The picks stay on the device until sign-in,
  then go to the account and show on the Map tab (see
  [Been cities](been-cities.md)).
- The city question reads "Where are you going?" after `Yes, I’m planning
one`, "Where’s your dream city?" when no goal or every goal is picked,
  and "Where do you go out?" otherwise. A tap on a city moves on; "Skip"
  and "Somewhere else" keep no city, and so does "Not sure yet", which
  replaces "Somewhere else" when Trips is picked without Date nights. A
  statement with Continue follows every city answer: it repeats the pick,
  if there is one, and names the city the sample comes from.
- The sample is always a real reel (`src/lib/aha-sample.ts`), chosen by the
  leading goal: Date nights, then Trips, then Places to eat. No city, or a
  city with no reel for that goal, gets Austin's: Eberly, The Guest House
  and Jupiter Supper Club for date nights; Austin Motel, Heritage Boot Co.
  and Jo's Coffee when Trips is picked without Date nights; Hula Hut, Ski
  Shores Cafe and Quince Lakehouse when only Places to eat is picked.
- "Try saving this reel." has a drawn share sheet: `Share` on the reel,
  then "Share to…", "More" and `Shelvr`. "Your first save!" follows, then
  the spots screen, "<city> · 3 places" (Austin in the tests) under a map,
  whose Continue enables once the pins land.
- Three slides follow: "Plan it together with your people.", "No more
  “where should we eat?”" and "Every place you saved, on one map."
  Continue, a swipe or a tap on the card moves to the next slide; on the
  last, Continue moves on.
- "Don’t miss the places you saved." asks for notifications; "Turn on
  reminders" and "Not now" both open the paywall. When iOS already has an
  answer the step is skipped, and the last slide's Continue opens the
  paywall.
- Closing the paywall keeps the person on the step that opened it, signed
  out; a cold launch comes back to the same step. With free saves on
  (`freeSaves.freePlanOpen`), a close finishes onboarding instead.

## How to get to it (user POV)

A fresh install: launch and tap "Get started". A development build launched
with `-E2EFreshInstall YES` forgets its sign-in and onboarding state first
(`src/lib/e2e-fresh-install.ts`). The first test relaunches at the sample
reel with `-E2EHidePro YES`, which makes a development build show the
person as not Pro (`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/onboarding.e2e.ts`, no model, three tests, each `retries: 0`:

- "asks for the paywall at the end of onboarding, and a close keeps it
  there": date nights, city skipped. Relaunches at the reel, saves it,
  walks the slides, opens and closes the paywall twice, then relaunches
  cold.
- "uses a real Austin trip reel for a city without one": `Trips`,
  `Not yet`, Tokyo as a Been city, Lisbon. Checks Austin's three trip
  spots, and that the last slide opens nothing on its own.
- "turns one sample reel into a date night's spots, then asks for the
  paywall": date nights, city skipped. Checks Austin's three date spots,
  then opens and closes the paywall.

Helpers in `tests/fresh-onboarding.ts`: `startFreshOnboarding` relaunches
with `-E2EFreshInstall YES`; `walkToSampleReel(screen, { goal, city, been })`
walks to the reel's `Share` button (date nights, no Been city and no city
by default; `been` names cities to search for and tick);
`shareTheSampleReel` saves it through the share sheet and "Your first
save!", then waits for "· 3 places"; `walkToCarouselEnd` returns the last
slide's Continue; `relaunchWith` reopens the app until a step shows. In
`tests/paywall-sheet.ts`, `continueToPaywall` taps that Continue, taps "Not
now" if the notifications step shows, and returns the control a close comes
back to. `afterEach` runs `startFreshOnboarding` again and closes the app,
so the next test starts signed out at the opener. It does not use
`startOnSeededHome`.

## Proof

The sample's spots show by name on "Austin · 3 places". After each paywall
close the step that opened it (the last slide, or the notifications step's
"Not now") is back, and `dev-login-button` and `Add` stay hidden; a cold
relaunch returns to that step with the splash gone, and the carousel
reopens on its first slide. No purchase is made.

## Charters

```
onboarding-flow|ios|skeptic|From a fresh install, walk Get started through the questions, the city and the sample reel's share sheet to the spots, the slides and the paywall; close the paywall, relaunch, and check the step is kept and nothing signs in
onboarding-sample|ios|skeptic|From a fresh install, plan Trips in Lisbon, save the sample reel, and check Austin's three trip spots show on the map and the slides before the paywall
```

## Gotchas

- Each test can take several minutes (timeout 600 s): cold launches
  through the dev client.
- Answer cards read their short titles ("Date nights", "Trips", "Places to
  eat"). The reel reads as one image, "Sample", or "Sample reel by
  @handle" once its video plays; its SAMPLE badge is hidden.
- The notifications step shows only while iOS has no answer for the app,
  so whether "Not now" appears depends on the simulator.
  `continueToPaywall` handles both.
- The fresh launch signs the dev user out; the next seeded test signs in
  again through `dev-login-button`.
- Do not reset the simulator keychain (`device.clearKeychain()`) instead.
  It restarts the test runner, which took one to three minutes on CI and
  timed the flow out.
