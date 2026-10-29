---
name: verify-shelvr
description: Launch, check, drive, and prove the Shelvr iOS app (apps/native development build on the iOS simulator) with the e2e suite in tools/e2e. Use before claiming a change to saving a link, Home's cities, or the paywall works on a device, when asked to verify or screenshot the app, or to bug bash it.
---

# Verify Shelvr

Read the e2e guide first (`pnpm exec e2e guide` from `tools/e2e`, topics with
`pnpm exec e2e guide <topic>`). This skill only says what is true of Shelvr.
The config is `tools/e2e/e2e.config.ts` (one target, `ios`; tests
`tools/e2e/tests/**/*.e2e.ts`). Run every command below from `tools/e2e`.
Getting a worktree onto a simulator at all (dependencies, `.env.local`, the
dev client, building it) is in
[docs/architecture/local-qa.md](../../../docs/architecture/local-qa.md); read
it rather than guessing.

## Launch

The target's `app.command` starts its own Metro
(`expo start --dev-client --port 8091` in `apps/native`), waits for
`http://localhost:8091/status`, and stops it after the run. Its log goes to
`.e2e/metro.log`. The app is the installed development build
`app.shelvr.save.dev`, opened with `--initialUrl` pointing at that Metro, so
nothing is started by hand. Before a run:

- **Device policy.** Read `tools/e2e/.env.local` when present. Its `E2E_DEVICE`
  is the local development and agent-testing default; the config loads it
  outside CI without overriding an explicit environment variable. Final QA
  uses `E2E_DEVICE=<E2E_QA_DEVICE from that file>` explicitly and keeps that
  device stock. Never apply SimSlim to the final-QA device. An explicit user
  device request wins. Do not silently fall back when the default is missing.
  List devices through Argent first and use one simulator at a time; leave
  devices and Metro servers owned by other projects or sessions alone.
- **Port.** 8091 by default; `E2E_METRO_PORT` moves it. A Metro already on the
  port makes the run fail to start its own.
- **Env.** `apps/native/.env.local` copied from the main checkout, pointing at
  the dev Convex deployment, with `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS=true`.
  The dev deployment must set `AUTH_ENABLE_ANONYMOUS=true`.
  `GOOGLE_GENERATIVE_AI_API_KEY` (an AI Studio key, never committed) is needed
  by `save-link`, which saves a real page. The `e2e ios` CI job runs with no
  key: its local backend sets `E2E_FAKE_AI=local-v1`, and the fake in
  `convex/model/fakeAi.ts` serves a fixture page
  (`https://fixtures.e2e.invalid/...`) for `save-link-fixture`, which skips
  itself unless the runner has `E2E_FAKE_AI=local-v1`. The fake refuses every
  deployment but a local one.
- **Data.** Every test's `beforeEach` (`startOnSeededHome` in
  `tests/seeded-home.ts`) signs in as the anonymous dev user and taps Settings >
  "Reset flow fixtures": a set of saves that group into cities
  (a Lisbon card is one), and Pro. That wipes the
  dev user's data, so never point it at an account you care about. The CI job
  sets `E2E_FIXTURE_RESET=backend`, which resets through
  `npx convex run devFixtures:resetAnonymousUsersForE2e` instead; that mutation
  refuses any backend but the local fake-model one, so leave it unset locally.
  `tests/onboarding.e2e.ts` does not start on the seeded Home: it launches
  with `-E2EFreshInstall YES` and starts from "Get started".

## Doctor

```bash
pnpm exec e2e list                          # loads the config, starts nothing; exit 0, one line per test file
pnpm exec e2e run tests/home-cities.e2e.ts  # Metro up, app opens, dev sign-in, fixture reset, Home lists "Your cities" with a Lisbon card; exit 0
```

`list` failing is the config or a dependency (`pnpm install` from the
worktree root). `run` failing in the `beforeEach` before Profile appears is the
bundle or the simulator: read `.e2e/metro.log` and check that the app is a
Debug dev client (local-qa.md, "Confirm the bundle is yours"). No
`dev-login-button` means the build is not the development variant or
`EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` is not `true` in `.env.local`
(`src/lib/anonymous-auth.ts`). A button that shows but never signs in is
`AUTH_ENABLE_ANONYMOUS` missing on the dev deployment. The home-cities test needs no model. Run Doctor first whenever anything
looks off.

Taps that can be lost (Home's `Add` and `Profile`) go
through `tapUntilVisible` in `tests/seeded-home.ts`: it taps again only when
the result has not appeared after a wait an accepted tap never needs. Each tap
is its own step in `.e2e/report.json`, so count them there: more than one tap
on one of those controls in a test means a tap was lost. A flow that still
fails is a failure to explain, not a flake to rerun away.

## Drive

Scripted, the normal lane: each core feature has a test under `tests/`
(see [features/](features/README.md)). Write new ones the same way:
`startOnSeededHome()` at the top, `openAddSheet` to open the Add sheet,
plain `screen` locators, and `agent.waitFor` with `vision: "only"` only where
the model writes the label (a link's title). Stable handles in this
app: test ids `add-article-input`, `dev-login-button`, `reset-flow-fixtures`;
the city cards on Home (buttons named `<City>` without pins, or `<City>, N places`
once mapped; do not require the comma); the `Profile` and `Add`
buttons on Home. There is no tab bar.

Live, over MCP: no `e2e mcp` server is registered in this repo. Add one for
your client with `--config tools/e2e/e2e.config.ts` (topic `mcp`), then
`open_session`, `observe`, and `locate` before writing a locator. The catalog
gets `open_app`, `swipe`, and `alert` from `mobileTools`; there are no
credentials or secrets, sign-in is the dev button. A live session starts the
same Metro on 8091, so never run one beside a test run.

## Evidence

Every run writes `.e2e/report.json`; a failed test gets its trace under
`.e2e/artifacts/`; `--trace on` adds one for passing tests, `--video on` records
an MP4 per attempt (topic `running`). The next run clears `.e2e/artifacts/`,
Doctor included, so a proof that must outlive it runs with
`--output .e2e/proof/<name>`. All of `.e2e/` is gitignored
(`tools/e2e/.gitignore`). Never commit screenshots or videos. A pull request
that touches UI files still needs a screenshot or recording embedded in its
description (`tools/verify-pr-evidence.mjs`): upload it there, quote the run's
summary lines beside it, then delete the local copy.

A proof goes through the user's path: Home's Add, the city cards, the labelled
fields and buttons, never a Convex function called directly. It captures the
action and the state after it. Side effects live in the dev Convex deployment
(`items`, `spaces`, `spaceItems`), and the flows read them back through the app:
a saved link shows under its city or under "No place found". Nothing
is mocked; link reads and titles go through the real backend and model.

## Bug bash

Not set up yet; this skill was generated without one, so the bug bash is
unproven. The charters are in [features/](features/README.md), one block per
feature, in the `slug|target|agent|charter` format topic `bug-bash` reads. To
run one, write an untracked `tools/e2e/e2e.bugbash.config.ts` that spreads
`e2e.config.ts`, adds `tests/bugbash/**` to the glob and the personas, and says
in its `context` that the seeded fixtures, the anonymous dev user, and the
development build are not bugs. Output goes to `.e2e/bugbash/`, already
ignored. Only one explorer at a time: there is one simulator and one Metro
port. A finding is a bug once `tests/bugbash/<slug>.e2e.ts` fails with
`ASSERTION_FAILED` on the assertion that encodes it.

## Cleanup

The runner stops the Metro it started; `close_session` stops the one a
session started. A simulator you booted, shut down with
`xcrun simctl shutdown <udid>` when done; one that was already booted stays.
Stop processes by the pid you started, never by name. The dev user's data is
reset by the next run, so there is nothing to undo there. Keep `.e2e/proof/`
and `.e2e/report.json` until the result is reported, then delete the
screenshots and videos under `.e2e/`.

## Helpers

None. The e2e CLI is the helper.
