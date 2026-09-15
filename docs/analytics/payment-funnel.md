# Onboarding and payment analytics

Dashboard: https://us.posthog.com/project/546847/dashboard/2075680

## Event contract

- `onboarding_step_viewed`: emitted when entering each named step, including the first. `step_id` and `step_index` identify the step without answers or saved content.
- `onboarding_step_completed`: emitted once per step per onboarding mount when advancing; `duration_ms` is wall-clock time since entry and can include background time.
- `onboarding_completed`: existing completion event. Authenticated and deferred onboarding are both supported; do not require a universal signup-before-onboarding order.
- `auth_started`, `auth_cancelled`, `auth_failed`: OAuth outcomes with provider only, no error messages or callback URLs.
- `auth_completed`: emitted after identifying the authenticated user. Also fires on authenticated cold starts, so it is **not a new-account signup event**.
- `paywall_requested`: before waiting for RevenueCat identity readiness.
- `paywall_presentation_started`: before calling the native presentation API. This is an attempt, not a confirmed impression. It includes sessions interrupted before the promise settles.
- `paywall_shown`: emitted after a cancel, purchase, or restore confirms the sheet was presented. The imperative API has no on-show callback. **Never use this event as the abandonment denominator.**
- `paywall_cancelled`, `paywall_purchase_completed`, `paywall_restored`, `paywall_failed`: client outcomes. A completed checkout can start a free trial and is not evidence of payment. Attempts/outcomes share `paywall_attempt_id` and `placement`. Failures use bounded reasons and no raw error text.
- `trial_started`: authenticated RevenueCat INITIAL_PURCHASE with TRIAL period.
- `payment_succeeded`: authenticated RevenueCat INITIAL_PURCHASE, RENEWAL, or NON_RENEWING_PURCHASE with a finite positive USD `price`. Excludes trial/promotional periods, family sharing, zero-price transactions, restores, cancellations, and transfers. `payment_kind` distinguishes initial, trial_conversion, renewal, and one_time. This measures positive charges, not net revenue after refunds or fees.
- `trial_cancelled`: authenticated RevenueCat CANCELLATION with a TRIAL period — auto-renew was turned off, or a refund hit the trial. `payment_kind` is `trial`.
- `subscription_cancelled`: CANCELLATION for a non-trial period; `payment_kind` is `subscription`. Both cancellation events carry `cancel_reason` (the verbatim RevenueCat enum when sent) and a derived `cancel_category`: `voluntary` (UNSUBSCRIBE, PRICE_INCREASE), `refund` (CUSTOMER_SUPPORT), `billing` (BILLING_ERROR), `developer` (DEVELOPER_INITIATED), `unknown` (UNKNOWN or absent). A `refund` cancellation is not a lost user — support refunds can leave auto-renew on, so payments may continue. Read known-voluntary churn as `cancel_category=voluntary`; a bare `cancel_reason != BILLING_ERROR` filter still mixes refunds and unknowns into "voluntary".
- `trial_expired`: EXPIRATION with a TRIAL period — the trial lapsed unconverted. Paid expirations are not emitted; `payment_kind` is `trial_lapsed`.
- `subscription_uncancelled`: UNCANCELLATION — auto-renew re-enabled. The general name is deliberate (the event fires for paid subscriptions too); `payment_kind` (`trial`/`subscription`) carries the split. It is the correction path in cancel funnels, never a conversion.
- `cancel_survey_shown`, `cancel_survey_dismissed`, `cancel_survey_submitted`: client events from the one-time next-visit card (`survey_source: next_visit_card`), shown when RevenueCat reports the trial cancelled but still inside its window (`willRenew=false`, period TRIAL). **A survey response is stated intent, never proof of cancellation**: the respondent may keep the subscription, and Settings-app cancellers who never return during the window never see the card. Only the webhook events above count as cancellations; never use survey responses as a funnel denominator. `reason` is a bounded id; the in-repo id→label mapping is `too_expensive` → Too expensive, `not_useful_enough` → Not useful enough, `missing_feature` → Missing a feature, `other` → Something else (`apps/native/src/lib/cancel-survey.ts`).

  Mechanics (`use-cancel-survey.ts` + `convex/cancelSurvey.ts`):
  - Detection re-runs on every foreground episode while on Home, so cancelling in iPhone Settings or the Customer Center and returning is caught in the same session; transient detection failures retry on the next episode.
  - The ask is durably one-per-account, enforced by a server row (`cancelSurveys` table): existence = asked, first recorded outcome wins. This holds across devices and reinstalls; the client fails closed (never asks when it cannot verify the ask is unspent).
  - `cancel_survey_shown` fires when the card actually renders — the ask is consumed at that moment, never at detection time.
  - If renewal resumes (`subscription_uncancelled`) while the card is up, the next foreground check takes it down silently.

- `$screen`: Expo Router route templates, retaining `[id]` placeholders. No route parameters, saved URLs, or OAuth codes. Automatic screen/touch capture is disabled to avoid duplicate or content-bearing events.

Client identity is the same Convex user ID passed to RevenueCat. PostHog identify merges the anonymous onboarding identity. Purchase events timestamp `purchased_at_ms`; the four cancellation lifecycle events timestamp `event_timestamp_ms` — both are the event's own moment, not webhook arrival time. Delivery retries preserve event UUID and time. A transactional receipt ledger deduplicates RevenueCat IDs independently of subscription ordering, so a late purchase remains measurable even if a later entitlement event arrived first. Missing/deleted users are ignored.

## Reading the dashboard

The September 8 billing-isolation follow-up added `account_created` from the Convex Auth new-account callback and separate signup/authenticated-visit tiles. `account_created` is emitted only for a new database account; `auth_completed` remains a login/cold-start signal. The owner promotional-test email is now included in the internal-user cohort. See [billing isolation verification](../billing-isolation-2026-09-08.md) for environment mapping, the collection baseline, and purchase checks. Historical signups are not backfilled.

All insights filter `environment=production` and PostHog test accounts. Backend purchase events become production only when `OBSERVABILITY_ENV=production` **and** RevenueCat reports PRODUCTION. Sandbox purchases are excluded. Account creation uses the backend environment; native builds derive environment from the build variant.

Onboarding has a one-day window. Payment funnels have a fourteen-day window to accommodate the seven-day free trial. Recent entrants have not had the full window to convert. Trial-conversion and initial-payment funnels exclude ordinary renewals; the country trend includes renewals and is labeled accordingly.

The trial funnel is `trial_started` → (`trial_cancelled` | `trial_expired` | `payment_succeeded` with `payment_kind=trial_conversion`), with `subscription_uncancelled` as the correction path: a cancelled trial that later converts reads `trial_cancelled` → `subscription_uncancelled` → `payment_succeeded`. Count the terminal event, not the intermediate cancel, when reading conversion. The cancel-survey events are client-side and inherit the build-variant `environment` like every other client event; the webhook lifecycle events are backend-captured and follow the same production filters as `payment_succeeded`.

## Trial cancellation insights

Three insights read the cancellation events (all filtered `environment=production` and PostHog test accounts, fourteen-day window):

1. **Known-voluntary cancel funnel** — `trial_started` → `trial_cancelled` filtered to `cancel_category=voluntary`. Refunds, billing failures, developer actions, and `unknown` are excluded from the voluntary rate and read as their own slices. A `refund` cancellation is not churn — auto-renew may remain on and payments continue.
2. **Survey mix over time** — `cancel_survey_submitted` grouped by `reason`, 100% stacked. The ask is once per account (server-enforced via the `cancelSurveys` row), so each person contributes at most one response. Reason-id → label mapping is kept in-repo (`apps/native/src/lib/cancel-survey.ts`) so PostHog data stays interpretable even if the card copy changes in a later build.
3. **Canceller behavior — evidence, not reason** — for the `trial_cancelled` cohort: saves created (`article_saved`, `note_saved`, `images_saved`), days active, and spaces used before the cancellation timestamp. Usage is corroborating evidence about the cohort: it can show that cancellers on average saved nothing, but it cannot establish why any individual cancelled. Do not label these charts with survey reasons.

The card appears only while the cancelled trial is still inside its window (auto-renew off, trial not yet expired); users who return after the trial lapsed are covered by `trial_expired`, not by the card. Detection is client-side from RevenueCat CustomerInfo; an untrusted read (`unknown`) never shows the card.

### Created insights (September 2026)

All four live on the [Onboarding and payment conversion dashboard](https://us.posthog.com/project/546847/dashboard/2075680), mirroring its conventions (global `environment = production` property, `filterTestAccounts` test-account exclusion, 30-day range):

1. **Known-voluntary cancel funnel** — `trial_started` → `trial_cancelled` with `cancel_category = voluntary`, 14-day conversion window. [insight 11832813](https://us.posthog.com/project/546847/insights/11832813)
2. **Cancel survey mix over time** — `cancel_survey_submitted` broken down by `reason`, percentage-stacked bars; at most one response per person. [insight 11832829](https://us.posthog.com/project/546847/insights/11832829)
3. **Canceller behavior — saves by the cohort** — HogQL: save events per day by persons who performed `trial_cancelled` vs all users (evidence, not reason). [insight 11832830](https://us.posthog.com/project/546847/insights/11832830)
4. **Canceller behavior — saves before cancel (per person)** — HogQL: CTE join of cancellers to their pre-cancellation saves. [insight 11832831](https://us.posthog.com/project/546847/insights/11832831)

All four are lazy-computed: open each tile once after events start flowing to confirm rendering and the two HogQL queries. Until the backend deploy and the rebuilt binary ship, expect empty charts — check event arrival before reading empties as zero.

## Cancellation flow decisions

Recorded 13 September 2026 from RevenueCat's cancellation-flow guidance, Apple telemetry boundaries, and the simulator walkthrough that found the Customer Center shipped with no cancel path. Do not reverse these without the data named below.

- **The survey is next-visit, not at-cancel.** The ask happens in a calm later session on Home, never inside the cancel flow. An at-cancel prompt catches only in-app cancellers (no survey can follow a user into iOS Settings), collects rushed tap-through answers, and its responses land in RevenueCat instead of this funnel. The card covers both cancel paths with one vocabulary, once per account.
- **Customer Center: cancel path ON, RevenueCat's built-in exit survey OFF.** The management path is a RevenueCat-dashboard launch requirement — without it, users cannot cancel in-app at all and must dig through iOS Settings. RC's exit survey stays off because an in-app canceller is indistinguishable from a Settings canceller (`willRenew=false` + TRIAL is identical in CustomerInfo), so running both surveys asks in-app cancellers twice with no way to suppress the second ask.
- **Apple sends no cancel reasons.** An empty `cancel_reason` is Apple's normal state, not a bug; the `unknown` category is the expected iOS mode. The only source of a stated reason on iOS is this survey (or an out-of-band channel like email).
- **The `trial_cancelled` → `cancel_survey_shown` drop-off is the never-return rate** — cancellers who do not open the app again during the trial window. No in-app survey (ours or RC's) can reach them; only email/push win-back can, which additionally requires enabling `$process_person_profile` on the cancellation events (kept off for cost). Roadmap order: measure this drop-off first, add win-back email or Apple win-back offers (iOS 18+) only if the rate justifies it, and reason-keyed offers (`too_expensive` → targeted offer) only with response volume.

For failure recordings, open **Paywall attempt to actual payment**, click the dropped-off people at the payment step, then inspect their matching recordings. A user who started a free trial yesterday is not yet a failed payer. For immediate checkout abandonment, inspect `paywall_cancelled` or `paywall_failed` events; unmatched presentation attempts also include force-quits and pending sheets. The paid-user journey is person-level; use the separate Useful returns dashboard for matching the same saved item across sessions.

For the 1.0.2 release, native replay is disabled for the production build variant
until its visual masking check is complete. Production funnel events remain enabled.
Development replay samples 20% of sessions, masks all text, images, and sandboxed
system views, disables logs/network telemetry, and captures at most one snapshot
per second. Not every failed journey will have a recording. Native dead-tap
detection is not promised. Replay requires a rebuilt native binary; an OTA
JavaScript update cannot add the plugin.

Website identities remain separate from app identities. Do not interpret these charts as a stitched landing-page-to-App-Store-install funnel.

## Release and verification

September 8 implementation verification: production Convex telemetry deployed to `amiable-setter-120`; the receipt index was added with no index deletions. Production observability environment and the existing PostHog token were verified. Native lint/typecheck and 384 tests passed, followed by an additional passing authenticated webhook integration test (385 tests total). The iOS development build succeeded and launched on iPhone 17 Pro Max; the debugger confirmed the native replay plugin initialized and recording active. Customer distribution, visual masking verification in the replay viewer, and the privacy-page rollout remain release steps.

1. Deploy Convex with the payment receipt table, enqueue mutation, webhook hook, and delivery action. Verify POSTHOG_PROJECT_TOKEN, POSTHOG_HOST, and OBSERVABILITY_ENV in the target deployment.
2. Ship a rebuilt native binary containing `@posthog/react-native-plugin` and the new JavaScript instrumentation. Publish the updated privacy disclosure with the rollout.
3. Exercise onboarding, cancellation, restore, and a sandbox purchase. Confirm matching IDs and distinct trial/payment semantics. Sandbox checks must remain excluded from production insights.
4. Verify text/image masking in a real replay from the rebuilt app before broad release. SDK configuration alone is not proof of rendered masking.
5. Check event arrival after release before interpreting empty charts as zero conversion. No historical payment or onboarding events have been fabricated or backfilled.

Payment deliveries retry five times after the initial attempt (six HTTP attempts total) for network failures, HTTP 429, and server errors. Other HTTP 4xx responses fail visibly without automatic retry. Missing analytics configuration also uses the bounded retry schedule, allowing configuration to be restored without another webhook. Exhausted deliveries surface as failed Convex actions; retry the failed scheduled action with its recorded arguments to retain its delivery UUID. The receipt deduplicates webhook ingestion, not successful PostHog delivery; it contains only the opaque RevenueCat event ID. Replaying the webhook is not a delivery-recovery mechanism.

Sandbox charges retain their amount for development diagnostics, but carry `environment=sandbox` on the production backend (or `development` on a development backend). Production reports must filter `environment=production`; an unfiltered sum of `revenue_usd` is not production revenue.

## Review verification — 9 September 2026

- The native dependency is `@posthog/react-native-plugin` 2.5.2. [PostHog's installation guide](https://posthog.com/docs/session-replay/installation/react-native) identifies it as the renamed session-replay module. It is autolinked; it is not an Expo config plugin and must not be added to the Expo `plugins` array. The prior native build/runtime checks confirmed it loaded.
- The installed iOS PostHog implementation explicitly checks both `RCTTextView` and Fabric `RCTParagraphComponentView` under `maskAllTextInputs`, so the claim that this setting only covers editable controls is incorrect for this build. Visual masking verification remains a release requirement; this source check does not replace it.
- The HTTP action calls `reconcileRevenueCatTransfer` with an `ActionCtx`: its owner query, RevenueCat requests, and final mutation do not share a transaction. The final `internal.subscriptions.reconcileTransfer` mutation starts one write transaction for all snapshots; its nested `upsertSubscription` calls share that transaction. An uncaught failure within this mutation rolls back all snapshot writes, but does not roll back the earlier owner query or external requests. A failure in the HTTP action after the mutation commits would not undo those writes. See the [Convex transaction documentation](https://docs.convex.dev/understanding/best-practices#use-ctxrunquery-and-ctxrunmutation-sparingly-in-queries-and-mutations).
- The legacy waitlist regression test inserts a row without `resendAttempts` and reads it through the actual indexed retry query. The `< maximum` range includes that missing value; the returned count is normalized to zero. No backfill is needed for this query.

References: [RevenueCat webhook fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields), [PostHog native replay](https://posthog.com/docs/session-replay/installation/react-native).
