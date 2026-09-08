# Useful returns

[PostHog dashboard](https://us.posthog.com/project/546847/dashboard/2073640)

The app records behavior; this dashboard is for the product team. It does not add a countdown, reminder, or analytics screen to Shelvr.

## Metric contract

- A save is an item successfully created in Convex, timed by `_creationTime`, not a photo's original `capturedAt`. Link, note, share-sheet, onboarding, camera, and Tidy imports all converge on the instrumented creation paths.
- A reopen is a focused, foreground item view in a nonempty PostHog session different from the original save session, within seven days of creation. Preloaded adjacent pages do not generate opens. Repeated opens count once per item in the report.
- A useful return is a reopen followed by `copy` or a platform-confirmed `share` of the same item in that return session, also within seven days of creation. This is an observable action signal, not proof that someone read an article or cooked a recipe.
- Sharing an image through `expo-sharing` reports `share_sheet_opened`, because that API cannot distinguish completion from cancellation. It is excluded from the useful-return rate. Map, search, source, phone, email, message, and calendar handoffs are recorded separately and also excluded from this first metric.
- The report evaluates 30 days of mature cohorts: items created 37–7 days ago. Recent saves are not prematurely counted as failures. Missing save sessions are displayed separately and excluded from rates; older app versions remain compatible but cannot establish a reliable return baseline.
- Grouping uses the authenticated user's ID and item ID. Only `environment = production` and `analytics_version = 1` events enter the report. Development fixtures are excluded from item views/actions; development QA events never enter production rates.

`useful-returns.sql` is the query saved in insight `a5igr9Re`. The second dashboard tile, `bLMQZLKB`, shows production collection health without waiting for cohorts to mature.

## Events

| Event | Origin | Important fields |
| --- | --- | --- |
| `item_saved` | Convex, once per creation transaction | `item_id`, `item_type`, `saved_at`, `save_session_id` |
| `item_opened` | Focused item pager / foreground return | `item_id`, `item_type`, `saved_at`, `item_age_ms`, `source`, SDK `$session_id` |
| `item_action` | Item detail actions and feed sharing | Same item fields, `action`, SDK `$session_id` |
| `item_space_membership_changed` | Space corrections and Undo | `item_id`, `space_id`, `membership_added`, `undone` |

All four include `environment` and `analytics_version`. These new events send identifiers and categorical metadata, not saved text, URLs, images, or Space names. Existing event contracts remain available.

Server delivery retries up to three times with the same event UUID and original timestamp. Failed telemetry delivery never rolls back an already committed save. Item-level aggregation also prevents duplicate deliveries from inflating the denominator.

## Filing behavior

Both article and image/note detail layouts show current Spaces and a Change action. Feed menus also link to Change spaces. The membership sheet offers Undo after a successful add/remove, disables edits during the request, and restores the previous selection with a visible error on failure. Accepting a suggestion from item detail also offers Undo.

Removing a saved membership now retains a `dismissed` record. Both AI classification passes respect that decision. Explicitly adding it again restores `saved`; AI cannot override that correction. This also applies to legacy memberships without an explicit status.

## Configuration and rollout

- Development backend verified on `amicable-antelope-639`; production backend is not deployed by this task.
- Deploy the backend before releasing the app, because the new client sends optional `analyticsSessionId` arguments. Existing clients remain valid against the new backend.
- Backend requires `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` pointing to the Shelvr project, with `OBSERVABILITY_ENV=production` in production. Missing tokens disable telemetry without breaking saves.
- Production app configuration defaults to Shelvr's public ingestion key and US ingestion host; explicit environment variables override these defaults. Development remains opt-in. Local development analytics was enabled in the ignored `.env.local` for end-to-end QA.
- Final seven-day results first appear after an instrumented production cohort matures. Existing historical saves cannot be backfilled into a trustworthy save-session baseline.
- AI-inferred purpose and contextual resurfacing remain the next phase; this establishes the baseline for evaluating them.

## Verification

Run `pnpm --filter native-app check` for lint, TypeScript, and unit/backend tests. Regression tests cover persistent removal, explicit restoration, authorization, canonical save timestamps, idempotent retries, telemetry UUID reuse, unavailable analytics, and content-free item event properties.

`validate-useful-returns.sql` runs synthetic rows directly through PostHog's SQL engine without inserting events. Expected: `valid` reopens and acts; `same_session` and `too_late` do neither; `unknown_session` is unmeasurable; `immature` is absent; `action_before_open` and `different_session` reopen but do not count as useful returns.

### Verification on 8 September 2026

- Lint and TypeScript passed; all 332 tests across 26 files passed.
- iPhone 17 Pro Max simulator: both plain-link and article-reader layouts showed current placement and Change. Removing a saved recipe displayed Undo; restoring it restored the membership. Adding the test article to Recipes showed the confirmation; Undo returned it to the inbox and cleared the notice.
- A disposable development save produced real `item_saved`, `item_opened`, and `item_action` events in PostHog with matching item/user identifiers. The save-session open/copy returned `0` reopens and `0` useful returns.
- Starting a new development analytics session, reopening the same item, and copying its link returned `1` reopen and `1` useful return. The QA-only query removed the cohort-maturity cutoff; the production query kept it and remained empty. No production user behavior is implied by this test.
- The disposable item was deleted afterward. The original recipe membership was restored.
- Runtime logs showed no errors during the check; existing Apple zoom-child and RevenueCat cached-login warnings were visible.
