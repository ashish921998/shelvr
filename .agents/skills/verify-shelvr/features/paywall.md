# Paywall

No entry without a plan. A signed-in account past onboarding without Pro
lands on the plan gate ("Pick a plan to open Shelvr") instead of Home, and
its See plans opens the RevenueCat paywall.

## Sub-features

- The plan gate shows See plans, Restore Purchases, Sign out, Settings, Terms
  and Privacy; Home, its saves and `Add` are not reachable.
- See plans opens RevenueCat's 3-step paywall: an intro (Continue), the
  trial timeline (See plans), then the plans: Yearly with a 7-day trial
  ("Try for $0.00, then …/year") and Weekly with none ("Subscribe for
  …/week"), plus Restore. It has no close control: a hard paywall, left by
  buying, restoring or relaunching. A relaunch lands on the plan gate again.
- Settings opens over the gate, with restore and account deletion.

## How to get to it (user POV)

Without Pro, launch the app and tap See plans on the plan gate. The dev user
is always Pro on the server, so the test relaunches with `-E2EHidePro YES`,
which makes a development build show them as not Pro
(`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/paywall.e2e.ts`, no model: `device.openApp` with the extra launch
argument, waits for the plan gate, taps `screen.getByRole("button", "See plans")`,
then `expectPaywall` (`tests/paywall-sheet.ts`) walks the three steps by
their buttons, which are the same for every onboarding goal: `Continue`, then
`See plans` (with `Go back`), then the `/^Yearly, /` and `/^Weekly, /` plan
buttons, the `/^Try for /` trial button and `Restore`. The intro's copy
follows the goal, so `expectPaywall` never waits on it. No assertion matches
a price. The test leaves the paywall by relaunching.

Plan switching has its own test: from the plans step it selects Weekly,
checks the `Subscribe for …/week` button and the "…/week from today" line,
then selects Yearly and checks the trial button comes back. The paywall at
the end of onboarding has its own feature file, [onboarding](onboarding.md).

## Proof

The gate shows instead of Home; See plans walks the paywall to its plans;
after a relaunch the gate is back and `Add` and the seeded saves stay hidden;
Settings opens with Delete account. No purchase is made; the server
entitlement is untouched.

## Charters

```
paywall-flow|ios|skeptic|Launched with -E2EHidePro YES, check the plan gate shows instead of Home, walk the paywall from See plans to its plans and relaunch; check the gate is back, Home and Add stay unreachable, and Settings opens
```

## Gotchas

- Prices come from the RevenueCat test store on a debug build; they are not
  the App Store prices.
- Purchases cannot be proved here. The dev user is Pro on the server whatever
  the client shows.
- The paywall is whatever the development RevenueCat project serves as its
  current offering. When that offering changes, these tests change with it;
  a failure that waits on paywall copy is usually that, not the app.
