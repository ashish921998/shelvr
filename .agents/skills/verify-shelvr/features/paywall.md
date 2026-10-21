# Paywall

No entry without a plan. A signed-in account past onboarding without Pro
lands on the plan gate ("Pick a plan to open Shelvr") instead of Home, and
its See plans opens the RevenueCat paywall.

## Sub-features

- The plan gate shows See plans, Restore Purchases, Sign out, Settings, Terms
  and Privacy; Home, its saves and `Add` are not reachable.
- See plans opens the paywall (v3, trial timeline): "How free trial works",
  the 7-day trial plan card, "View all plans", "Start 7-day free trial" and
  "Restore purchases"; closing it returns to the plan gate.
- Settings opens over the gate, with restore and account deletion.

## How to get to it (user POV)

Without Pro, launch the app and tap See plans on the plan gate. The dev user
is always Pro on the server, so the test relaunches with `-E2EHidePro YES`,
which makes a development build show them as not Pro
(`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/paywall.e2e.ts`, no model: `device.openApp` with the extra launch
argument, waits for the plan gate, taps `screen.getByRole("button", "See plans")`,
then `expectPaywall` (`tests/paywall-sheet.ts`): `getByText("How free trial
works")`, `/Shelvr Pro/`, the `/^7-day trial, /` plan button, `View all plans`,
`Start 7-day free trial` and `/^Restore purchases$/i`; the close control is the
button named `Close` (provided by the upgraded native SDK). No assertion matches a price.

Plan switching has its own test: it opens "View all plans", selects Monthly,
checks the billed-today disclosure, then selects Annual and checks the trial
CTA. `expectPaywall` only observes the initial paywall, so the entry and
dismissal tests never need to switch plans. The onboarding test cold-launches
once after completion, verifies and dismisses the intentional replay paywall
for pending unpaid setup, then checks the plan gate and both splash layers. Whole-test
retries are disabled so a failed launch cannot become a flaky pass.

## Proof

The gate shows instead of Home; See plans shows the paywall with its trial
plan and the way to all plans; after each close the gate is back and `Add`
and the seeded saves stay hidden; Settings opens with Delete account. No
purchase is made; the server entitlement is untouched.

## Charters

```
paywall-flow|ios|skeptic|Launched with -E2EHidePro YES, check the plan gate shows instead of Home, open the paywall from See plans and close it; check the gate is back, Home and Add stay unreachable, and Settings opens
```

## Gotchas

- Prices come from the RevenueCat test store on a debug build; they are not
  the App Store prices.
- Purchases cannot be proved here. The dev user is Pro on the server whatever
  the client shows.
