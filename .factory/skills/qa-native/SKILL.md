---
name: qa-native
description: >
  QA tests for the Shelvr Expo native app. End-to-end flows on an iOS
  simulator: sign-in via anonymous dev login, onboarding demo save, Pro
  gate/paywall, spaces + suggestions, search, item detail, profile, and the
  dev fixture reset. Runs locally against the dev Convex deployment using the
  argent simulator tools. Use when a diff touches apps/native/src/** or the
  app's build config.
---

# qa-native — Expo App E2E (iOS Simulator, local-only)

**What this covers:** the user-facing native app at `apps/native`, driven as
a real user on an iOS simulator against the **development** Convex deployment
(`https://amicable-antelope-639.convex.cloud` — the dev build's config
hard-rejects the production URL; never try to point a dev build at prod).

**Two drivers, same journey:** this skill is the agent-driven layer (argent
session tools, used in interactive Factory sessions). A subscription-free
Maestro baseline covers the same core journey in CI — flows live in
`.maestro/`, scheduled nightly + manual dispatch via
`.github/workflows/qa-mobile.yml` (macOS runner). Keep the two in sync when
flows change.

**Driver:** the argent simulator session tools. Use
`argent___list-devices` / `argent___boot-device` / `argent___launch-app` /
`argent___gesture-tap` / `argent___gesture-swipe` / `argent___keyboard` /
`argent___paste` / `argent___screenshot` /
`argent___screen-recording-start` / `argent___screen-recording-stop` /
`argent___await-ui-element` / `argent___await-screen-idle` /
`argent___native-describe-screen` / `argent___describe`. These exist only in
interactive Factory sessions. Under `droid exec` in CI they are absent:
report the whole native app as BLOCKED, "mobile QA is local-only", and
continue with other affected apps.

**Target device:** any booted iPhone simulator. The dev build's bundle id is
`app.shelvr.save.dev` (scheme `shelvr`, dev icon), so it never collides with
an App Store install.

## Pre-flight (setup, not a test row)

1. `apps/native/.env.local` must contain `EXPO_PUBLIC_CONVEX_URL` (dev),
   `EXPO_PUBLIC_CONVEX_SITE_URL`, `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS=true`,
   and `EXPO_PUBLIC_REVENUECAT_TEST_KEY`. All verified present on this
   machine. Missing → BLOCKED with the key name.
2. The dev Convex deployment must have `AUTH_ENABLE_ANONYMOUS=true`
   (verified). If the Dev login button never appears, this is why.
3. Get the app on the simulator:
   - If the dev client is already installed: start Metro in the background
     (`pnpm --filter native-app start`), then `argent___launch-app` the dev
     build (`app.shelvr.save.dev`).
   - Otherwise build + install from the tracked prebuild at
     `apps/native/ios/`: `pnpm --filter native-app ios` (runs `expo run:ios`;
     first build takes minutes — build once per simulator image, reuse
     afterwards). It starts Metro and launches the app itself. (The
     repository-root `ios/` directory is gitignored stray output — ignore it.)
4. Erase simulator content when a run needs a truly fresh install state
   (first-run flows): simulator erase is destructive to that simulator's
   data — only erase a simulator you booted for QA.

Generate a unique `RUN_ID` for the run; all artifacts go to
`./qa-results/$RUN_ID/`.

## Flow Menu

The orchestrator picks flows by diff relevance. The flows below are ordered
as one coherent user journey; when running several, prefer this order — each
step assumes the previous state (a fresh anonymous user must NOT have the
fixture reset applied yet, or the Pro-gate flow cannot trigger).

### 1. app-launch — the app boots to sign-in

- `argent___boot-device` (if needed), `argent___launch-app` the dev build,
  `argent___await-screen-idle`.
- PASS: the sign-in screen renders with the Apple sign-in button
  (`testID: apple-sign-in-button`), a Google button, and the dev-only
  "Dev login" button (visible because anonymous auth is enabled).
- FAIL: crash, white screen past 60s, or missing Dev login button (check
  pre-flight items 1–2 before failing).

### 2. sign-in-anonymous — one-tap dev sign-in works

- Tap the Dev login button (`argent___gesture-tap`; find its frame with
  `argent___native-find-views` if the label surprises you — the app is
  localized, so never assume exact English text).
- PASS: auth completes without OAuth, and the app routes into the `(app)`
  group (onboarding or home). No web auth view should appear.
- FAIL: an external web auth flow opens (that is an OAuth button, not Dev
  login), or sign-in spins >30s.

### 3. onboarding-demo-save — first-run onboarding + the one free demo save

- Complete onboarding as presented (it includes a live demo: one real link
  save without Pro — backend `createDemoItem`).
- When asked for a link, paste a real, fetchable article URL with
  `argent___paste` (use a stable article, e.g. a Wikipedia page —
  `https://en.wikipedia.org/wiki/Bookshelf`). Confirm.
- The item saves and shows `processing`, then the Convex AI pipeline (fetch +
  Readability + Gemini classification) flips it to `ready` with a generated
  title/description/tags. Enrichment is slow: poll the screen with
  `argent___await-screen-idle` / describe for up to 60s.
- PASS: the saved item reaches `ready` with a generated title and tags
  visible in the UI.
- FLAKY: still `processing` after 60s (re-check once after 30 more seconds
  before calling FAIL — dev cold starts can be slow).
- FAIL: item stuck `failed`, or title/description missing after `ready`.

### 4. pro-gate-paywall — second save is gated and the paywall renders

- Without applying the fixture reset (which grants Pro), attempt a second
  link save via the add flow.
- PASS: the paywall screen appears instead of the save completing. The
  RevenueCat offerings UI renders from the Development Test Store. Do NOT
  complete a purchase — dismiss/cancel the paywall.
- FAIL: the second save succeeds (the `demo_used` / entitlement gate broke)
  or the paywall is blank (offerings failed to load from the test store).
- This is the flow's negative assertion pair: first save allowed, second
  gated.

### 5. fixture-reset — deterministic seed + Pro entitlement

- Open profile (tabs), tap `testID: reset-flow-fixtures`, confirm the dialog.
- The reset deletes the anonymous user's data and inserts the fixture
  library, including a `lifetime` Pro subscription row.
- PASS: the feed now shows the four fixture items (Weeknight Miso Ramen,
  Belém Tower, Apartment Shopping Checklist, The Value of Craft) and spaces
  show Recipes / Trips / Apartment Shopping List. The reset button is only
  visible for the anonymous dev persona — its absence means the persona or
  deployment flag is wrong.
- If `reset-flow-fixtures` is missing: `AUTH_ENABLE_ANONYMOUS` is off or the
  user is not anonymous → BLOCKED.

### 6. spaces-suggestions — space creation runs the recommendation pass

- Create a new space (`new-space`) named `QA Space <RUN_ID>` (fresh name per
  run — `createSpace` is idempotent by trimmed name, and a reused name
  exercises the reuse branch instead of creation).
- PASS: the space is created and, after the recommendation pass (scheduled,
  so give it up to ~30s), suggested items appear.
- Accept one suggestion → the item shows as filed in the space with `saved`
  status. Dismiss a different suggestion → it disappears from suggestions
  and does not come back on reload.
- FAIL: suggestions never arrive (recommendation action failed) or accept
  does not move the item into the space.

### 7. item-detail — detail screen renders per item type

- Open "The Value of Craft" (has article content) → the reader renders
  paragraphs. Open the ramen link (fixture `no_article` state) → the detail
  still renders title/description/tags without a reader body.
- PASS: both render their respective layouts without crash.
- Adjacent check when the diff touches detail rendering: tags, intents
  (e.g. "Open recipe"), and the back navigation all work.

### 8. search — full-text search finds fixtures

- Open the search tab, type `ramen` with `argent___keyboard`.
- PASS: "Weeknight Miso Ramen" appears in results.
- Negative: search a nonsense string (`zzqq<RUN_ID>`) → empty state, no
  crash.

### 9. note-save — Pro note save round-trips (after reset, so Pro is active)

- Add → note: type a short note body with the keyboard, save.
- PASS: the note appears and reaches `ready` with a generated title/tags.
  (After the fixture reset the user is Pro, so this save must not hit the
  paywall; hitting the paywall here means the fixture `lifetime` row is not
  being honored → FAIL.)

### 10. profile-entitlement — profile reflects Pro state

- Open profile. After the fixture reset it must reflect the entitled state
  (Pro/lifetime), and show the signed-in dev persona.
- PASS: entitlement state visible and consistent with the fixtures.
- Adjacent: `reset-flow-fixtures` remains present.

### 11. cleanup-reset — restore deterministic state (always LAST)

- Trigger the fixture reset once more (profile → `reset-flow-fixtures` →
  confirm). This deletes every item/space the run created and restores the
  fixture library for the next run.
- PASS: cleanup step itself is not a test row; if it fails, note it under
  Action Required in the report.

## Per-flow evidence

- After each meaningful state change, capture the element tree
  (`argent___native-describe-screen` or `describe`), trimmed to the relevant
  nodes, as a labeled fenced block. Every snapshot must show something new.
- Save a screenshot per meaningful step via `argent___screenshot` into
  `./qa-results/$RUN_ID/`.
- When `video_evidence: true` in `.factory/skills/qa/config.yaml`, record
  exactly one video per flow via `argent___screen-recording-start` /
  `argent___screen-recording-stop`, saved as
  `./qa-results/$RUN_ID/<flow-slug>.mp4`. Verify the file is non-empty;
  retry once, else fall back to text + screenshots. When `video_evidence:
false`, do not record. Recordings are local artifacts — reference
  filenames in the report; never embed local paths as images.
- Never paste user content (note bodies, saved URLs) into the report beyond
  what proves the assertion.

## Known Failure Modes

1. **App hangs at launch with the dev client spinner** — Metro is not running
   or the bundle is stale. Start/restart Metro (`pnpm --filter native-app
start`, add `--clear` on bundle errors), relaunch the app.
2. **Dev login button missing** — `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` unset in
   `.env.local` (client side) or `AUTH_ENABLE_ANONYMOUS` off on the dev
   deployment (server side). BLOCKED; fix the env, rebuild/reinstall only if
   the client-side value was baked in.
3. **OAuth screen opened accidentally** — the tap hit the Apple/Google button
   instead of Dev login. Cancel the web auth, return, re-aim by frame from
   `argent___native-find-views`.
4. **Localized labels differ from expectations** — the app localizes via
   expo-localization; device locale changes all copy. Navigate by testID
   where one exists, else by structure from the described element tree, and
   never assert literal button text.
5. **Enrichment slower than 60s** — link processing includes a page fetch and
   a model call on the dev deployment. Wait, poll, and only then FLAKY/FAIL.
6. **Paywall shows the Development Test Store** — expected in dev builds
   (config pins the test key). Never complete a purchase; there is no
   StoreKit sandbox account in scope.
7. **Reset refused ("exceeds 200 rows")** — the anonymous user accumulated
   more data than the fixture-reset limit. Report BLOCKED with the message;
   the user should clear the dev user via dashboard.
8. **Simulator state bleeds between runs** — first-run flows (onboarding,
   demo save, Pro gate) assume a fresh anonymous user. If the app is already
   signed in with fixtures loaded, either continue from flow 5 onward or
   erase the simulator you booted for QA and relaunch.
9. **Push/notifications prompts** — the app may request notification
   permission; dismiss OS dialogs via the button tools and do not treat the
   prompt as a failure. Push delivery is untestable on simulator (persona
   `cannot_do`).
