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
- `$screen`: Expo Router route templates, retaining `[id]` placeholders. No route parameters, saved URLs, or OAuth codes. Automatic screen/touch capture is disabled to avoid duplicate or content-bearing events.

Client identity is the same Convex user ID passed to RevenueCat. PostHog identify merges the anonymous onboarding identity. Payment events use `purchased_at_ms`, not webhook arrival time. Delivery retries preserve event UUID and time. A transactional receipt ledger deduplicates RevenueCat IDs independently of subscription ordering, so a late purchase remains measurable even if a later entitlement event arrived first. Missing/deleted users are ignored.

## Reading the dashboard

The September 8 billing-isolation follow-up added `account_created` from the Convex Auth new-account callback and separate signup/authenticated-visit tiles. `account_created` is emitted only for a new database account; `auth_completed` remains a login/cold-start signal. The owner promotional-test email is now included in the internal-user cohort. See [billing isolation verification](../billing-isolation-2026-09-08.md) for environment mapping, the collection baseline, and purchase checks. Historical signups are not backfilled.

All insights filter `environment=production` and PostHog test accounts. Backend purchase events become production only when `OBSERVABILITY_ENV=production` **and** RevenueCat reports PRODUCTION. Sandbox purchases are excluded. Account creation uses the backend environment; native builds derive environment from the build variant.

Onboarding has a one-day window. Payment funnels have a fourteen-day window to accommodate the seven-day free trial. Recent entrants have not had the full window to convert. Trial-conversion and initial-payment funnels exclude ordinary renewals; the country trend includes renewals and is labeled accordingly.

For failure recordings, open **Paywall attempt to actual payment**, click the dropped-off people at the payment step, then inspect their matching recordings. A user who started a free trial yesterday is not yet a failed payer. For immediate checkout abandonment, inspect `paywall_cancelled` or `paywall_failed` events; unmatched presentation attempts also include force-quits and pending sheets. The paid-user journey is person-level; use the separate Useful returns dashboard for matching the same saved item across sessions.

Native replay samples 20% of sessions, masks all text, images, and sandboxed system views, disables logs/network telemetry, and captures at most one snapshot per second. Not every failed journey will have a recording. Native dead-tap detection is not promised. Replay requires a rebuilt native binary; an OTA JavaScript update cannot add the plugin.

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
