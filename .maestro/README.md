# Maestro E2E flows — Shelvr (iOS simulator)

Subscription-free mobile E2E: these YAML flows drive the dev-client app
(`app.shelvr.save.dev`) on an iOS simulator against the **development** Convex
deployment. CI runs them nightly and on manual dispatch in
`.github/workflows/qa-mobile.yml`; locally run them with:

```bash
xcrun simctl boot "<your iPhone>"          # if no simulator is booted
pnpm --filter native-app exec expo start --dev-client   # Metro, in another terminal
maestro test .maestro/
```

Selectors come from `apps/native/src/locales/en.json` (the app is localized,
so flows match the English catalog) plus stable testIDs where they exist
(`apple-sign-in-button`, `reset-flow-fixtures`). The simulator's language must
be English.

## Flow order (files run alphabetically)

1. `00-signin` — app launches, anonymous dev sign-in completes (one tap).
2. `01-demo-save` — the onboarding live demo saves one real link without Pro;
   enrichment (page fetch + classification) must reach the saved state.
3. `02-paywall-gate` — the second save is blocked by the paywall.
4. `03-fixture-reset-search` — the dev fixture reset seeds deterministic data
   (and Pro), the shelf shows fixture items, search finds them. The reset at
   the end doubles as cleanup for the anonymous user the run created.

## Iterating

These flows were authored from the locale catalog, not from a live run —
expect the first CI run to need selector tweaks. Use
`maestro studio .maestro/00-signin.yaml` against a running app to inspect the
element tree and fix selectors; screenshots land in `~/.maestro/tests/`.
Keep flows aligned with `.factory/skills/qa-native/SKILL.md` (the agent-driven
layer) — same journey, two drivers.

## Notes

- Each CI run signs in as a fresh anonymous dev user; rows accumulate in the
  dev deployment (accepted by design, same as the waitlist `qa+` rows).
- The demo-save flow's 120s enrichment timeout covers the real AI pipeline on
  the dev deployment; do not shorten it without checking Convex function
  timings.
