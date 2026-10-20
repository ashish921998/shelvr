# Paywall

Someone without Pro who tries a Pro action gets the RevenueCat paywall
instead.

## Sub-features

- Home's `Add` opens the paywall, not the Add sheet.
- Home's "View Pro plans" prompt opens the same paywall.
- The paywall (v3, trial timeline) shows "How free trial works", the 7-day
  trial plan card, "View all plans", "Start 7-day free trial" and "Restore
  purchases"; closing it returns to Home unchanged.

## How to get to it (user POV)

Without Pro, Home > `Add` or "View Pro plans". The dev user is always Pro on
the server, so the test relaunches with `-E2EHidePro YES`, which makes a
development build show them as not Pro and skips the exit offer
(`src/lib/e2e-hide-pro.ts`).

## Driving it with e2e

`tests/paywall.e2e.ts`, no model: `device.openApp` with the extra launch
argument, `screen.getByRole("button", "View Pro plans")`,
then `expectPaywall` (`tests/paywall-sheet.ts`): `getByText("How free trial
works")`, `/Shelvr Pro/`, the `/^7-day trial, /` plan button, `View all plans`,
`Start 7-day free trial` and `/^Restore purchases$/i`; the close control is the
button named `Close` (provided by the upgraded native SDK). No assertion matches a price.

Plan switching has its own test: it opens "View all plans", selects Monthly,
checks the billed-today disclosure, then selects Annual and checks the trial
CTA. `expectPaywall` only observes the initial paywall, so the entry and
dismissal tests never need to switch plans. The onboarding test cold-launches
once after completion, verifies and dismisses the intentional replay paywall
for pending unpaid setup, then checks Home and both splash layers. Whole-test
retries are disabled so a failed launch cannot become a flaky pass.

## Proof

Both entry points show the paywall with its trial plan and the way to all plans; after each close Home
shows the four seeded saves, no Add sheet, and nothing processing. No
purchase is made; the server entitlement is untouched.

## Charters

```
paywall-flow|ios|skeptic|Launched with -E2EHidePro YES, reach the paywall from every Pro entry point on Home and close it each time; check Home is unchanged and no save was started
```

## Gotchas

- Prices come from the RevenueCat test store on a debug build; they are not
  the App Store prices.
- Purchases cannot be proved here. The dev user is Pro on the server whatever
  the client shows.
