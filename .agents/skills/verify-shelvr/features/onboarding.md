# Onboarding

A new account walks a short setup before Home: a goal, a first save to
practise, and then the paywall. The opener carries an "Already have an
account? Sign in" link for returning people; a new account stays signed out
through the paywall and signs in after it.

## Sub-features

- "Start yours" opens "What do you save?", one button per goal
  (`Travel ideas`, ..., `Something else`).
- `Something else` asks for interests (checkboxes such as `AI & tech`), then
  Continue. `Travel ideas` asks "Where are you going next?" with a city list
  ending in "Not sure yet".
- The share practice step offers "I'll try it later"; then "Let's go" asks
  for the paywall.
- Closing the paywall keeps the person on the "Let's go" step, signed out; a
  cold launch comes back to the same step.
- Travel shows a sample Prague trip first ("There it is. Your Prague trip.",
  "SAMPLE TRIP", day 1 "Staré Město") on a map, before "Let's go".

## How to get to it (user POV)

A fresh install: launch and tap "Start yours". A development build launched
with `-E2EFreshInstall YES` forgets its sign-in and onboarding state first
(`src/lib/e2e-fresh-install.ts`). The tests relaunch with `-E2EHidePro YES`
before "Let's go" so a development build shows the paywall
(`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/onboarding.e2e.ts`, no model, two tests, `retries: 0`. Helpers in
`tests/fresh-onboarding.ts`: `startFreshOnboarding` relaunches with
`-E2EFreshInstall YES`, `walkToSharePractice(screen, "Something else" |
"Travel ideas")` walks to "I'll try it later", and `relaunchWith` reopens the
app until a step shows. `afterEach` runs `startFreshOnboarding` again, so the
next test starts signed out at the opener. It does not use
`startOnSeededHome`.

## Proof

After each paywall close "Let's go" is back and `dev-login-button` stays
hidden; a cold relaunch returns to "Let's go" with the splash gone. No
purchase is made.

## Charters

```
onboarding-flow|ios|skeptic|From a fresh install, walk Start yours through the share practice and Let's go; close the paywall, relaunch, and check the step is kept and nothing signs in
onboarding-travel|ios|skeptic|From a fresh install, pick Travel ideas and Not sure yet, skip the share practice, and check the sample Prague trip shows before the paywall and Let's go returns after it closes
```

## Gotchas

- Each test can take several minutes (timeout 600 s): two cold launches
  through the dev client.
- Buttons with a chevron read with ", Forward" appended ("Not sure yet,
  Forward"); match them by prefix. Text styled in capitals reads in
  capitals ("SAMPLE TRIP").
- "Not sure yet" is below the fold on iPhone 17; scroll to it first.
- The fresh launch signs the dev user out; the next seeded test signs in
  again through `dev-login-button`.
- Do not reset the simulator keychain (`device.clearKeychain()`) instead. It
  restarts the test runner, which took one to three minutes on CI and timed
  the flow out.
