# Onboarding

A new account answers three short questions, picks a city, sees one sample
reel turned into a plan, answers the trial reminder, then meets the paywall.
The opener carries an "Already have an account? Sign in" link for returning
people; a new account stays signed out through the paywall and signs in
after it.

## Sub-features

- "Get started" opens "How many spots have you saved already?"; then "What
  do you want to plan?" (checkboxes `Date nights`, `Trips`, `Places to eat`,
  `A bit of everything`) and "How do you like to plan?". Each has Continue
  (disabled until an answer) and "Skip" in the header.
- "Pick a city to try it with" is a photo grid; "Skip" or "Somewhere else"
  uses Prague.
- The sample reel has a drawn share sheet; the `Shelvr` button moves on to
  "Found 3 spots in that reel" (Continue enables once the pins land), then
  "Your date night in Prague" and "Save your own spots".
- "We'll remind you before it ends" asks 1, 2 or 3 days; "Not now" or
  Continue asks for the paywall. Skipped when notifications are settled.
- The paywall has no close. A relaunch comes back to the reminder step,
  signed out, and "Not now" opens the paywall again.

## How to get to it (user POV)

A fresh install: launch and tap "Get started". A development build launched
with `-E2EFreshInstall YES` forgets its sign-in and onboarding state first
(`src/lib/e2e-fresh-install.ts`). The tests relaunch with `-E2EHidePro YES`
at the sample reel so a development build shows the paywall
(`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/onboarding.e2e.ts`, no model, two tests, `retries: 0`. Helpers in
`tests/fresh-onboarding.ts`: `startFreshOnboarding` relaunches with
`-E2EFreshInstall YES`, `walkToSampleReel(screen)` walks to the reel's
`Shelvr` button planning date nights, and `relaunchWith` reopens the app
until a step shows. `afterEach` runs `startFreshOnboarding` again, so the
next test starts signed out at the opener. It does not use
`startOnSeededHome`.

## Proof

After a relaunch from the paywall, the reminder step's "Not now" is back with
the splash gone and `dev-login-button` hidden, and it opens the paywall again.
No purchase is made.

## Charters

```
onboarding-flow|ios|skeptic|From a fresh install, walk Get started through the questions and the sample reel to the reminder and the paywall; relaunch, and check the step is kept, nothing signs in, and the paywall opens again
onboarding-sample|ios|skeptic|From a fresh install, plan date nights in Prague, tap Shelvr on the sample reel, and check the three spots, the date-night plan and the reminder show before the paywall
```

## Gotchas

- Each test can take several minutes (timeout 600 s): two cold launches
  through the dev client.
- Answer cards read their title and subtitle ("Date nights, Dinners,
  drinks, surprises"); match them by prefix. Text styled in capitals reads
  in capitals ("SAMPLE").
- The fresh launch signs the dev user out; the next seeded test signs in
  again through `dev-login-button`.
- Do not reset the simulator keychain (`device.clearKeychain()`) instead. It
  restarts the test runner, which took one to three minutes on CI and timed
  the flow out.
