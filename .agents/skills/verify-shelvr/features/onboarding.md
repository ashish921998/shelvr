# Onboarding

A new account walks a short setup before Home: what they are into, what they
save, a first save, and then the paywall. The opener carries an "Already have
an account? Sign in" link for returning people; a new account stays signed
out through the paywall and signs in after it.

## Sub-features

- "Start yours" opens "What are you into?", then "What do you save?" with
  one checkbox per kind (`Articles`, `Travel`, ...), then "Save your first ...".
- "Save it, ..." queues the first save; "I'll try it later" skips the share
  step; "I'm in" asks for the paywall.
- Closing the paywall keeps the person on the "I'm in" step, signed out; a
  cold launch comes back to the same step.
- Picking Travel builds a sample Prague trip first: "Unlock the full trip"
  opens the paywall, and closing it returns to the trip.

## How to get to it (user POV)

A fresh install, or a signed-out app with an empty keychain: launch and tap
"Start yours". The tests relaunch with `-E2EHidePro YES` before "I'm in" so a
development build shows the paywall (`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/onboarding.e2e.ts`, no model, two tests, `retries: 0`. Helpers in
`tests/fresh-onboarding.ts`: `startFreshOnboarding` closes the app and clears
the keychain, `walkToFirstSave(screen, "Articles" | "Travel")`,
`queueFirstSave`, `relaunchWith`. `afterEach` clears the keychain again, so
the next test signs in from scratch. It does not use `startOnSeededHome`.

## Proof

After each paywall close the step that asked for it ("I'm in" or "Unlock the
full trip") is back and `dev-login-button` stays hidden; a cold relaunch
returns to "I'm in" with the splash gone. No purchase is made.

## Charters

```
onboarding-flow|ios|skeptic|From a fresh install, walk Start yours through the first save and I'm in; close the paywall, relaunch, and check the step is kept and nothing signs in
onboarding-travel|ios|skeptic|From a fresh install, pick Travel, queue the first save, and check the sample Prague trip shows before the paywall and returns after it closes
```

## Gotchas

- Each test can take several minutes (timeout 600 s): two cold launches
  through the dev client.
- Clearing the keychain signs the dev user out; the next seeded test signs in
  again through `dev-login-button`.
