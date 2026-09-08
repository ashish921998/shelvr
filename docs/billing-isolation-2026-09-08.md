# Billing configuration and customer measurement — 8 September 2026

## Apple connection

- Added App Store Connect API key `A4QUGSA4WD`, named `Shelvr RevenueCat Sep 2026`, with App Manager access. RevenueCat reports **Valid credentials**. Its private file is stored outside the repository under the existing local App Store Connect private-key directory.
- The older dedicated RevenueCat key's private file was unavailable. No existing Apple keys were revoked or modified, and the broader Admin key was not uploaded.
- The required In-App Purchase key was already valid. Apple server notifications were already arriving.
- App Store Connect confirms approved monthly (`ONE_MONTH`, USD 4.99), annual (`ONE_YEAR`, USD 19.99), and weekly (`ONE_WEEK`, USD 3.99) subscriptions. The live default offering contains monthly and annual only.
- The annual product has a one-week free introductory offer across 175 territories. Monthly has no introductory offers. No production prices, trial policies, or offering packages were changed.

## Separate development traffic

Production RevenueCat remains [Shelvr](https://app.revenuecat.com/projects/2a02f792/overview). Development and preview use [Shelvr Development](https://app.revenuecat.com/projects/963bf108/overview), with its own Test Store and authenticated webhook to `https://amicable-antelope-639.convex.site/webhooks/revenuecat`.

EAS previously pointed **development and preview at production Convex**. Development's Test Store key also belonged to the production RevenueCat project. The environments now use:

| Environment | Convex deployment | RevenueCat |
| --- | --- | --- |
| Production / internal-test | `amiable-setter-120` | Existing platform-specific production keys |
| Development / preview | `amicable-antelope-639` | Dedicated `EXPO_PUBLIC_REVENUECAT_TEST_KEY` for project `963bf108` |

The ignored local `.env.local` uses the isolated test key too. Platform modules choose the key by the build variant. The old Android profile override was removed. Build validation rejects production Convex in development/preview, the old production-project Test Store key, and a development backend or Test Store key in production EAS builds.

RevenueCat now receives the authenticated Convex user ID in its initial SDK configuration, avoiding an unnecessary anonymous customer before login. Existing customer history is retained; historical RevenueCat counts do not immediately become clean after changing build configuration.

The development entitlement identifier is `shelvr_pro`, configured through `REVENUECAT_ENTITLEMENT_ID`; production defaults to its existing `Shelvr Pro` identifier. Transfer reconciliation reads only the configured entitlement. Development customer lookups use the development project's public Test Store key, verified against the v1 customer endpoint.

The isolated default offering uses `monthly_499` (USD 4.99, no trial) and `annual_1999` (USD 19.99, one-week trial), matching the live App Store plans. A published development copy of V1 is attached to that offering. The cross-project copy did not include custom fonts, so only the development copy uses system fonts to resolve missing-font validation errors. The production paywall was not edited.

## Production measurement

[Onboarding and payment dashboard](https://us.posthog.com/project/546847/dashboard/2075680)

- Added server-side `account_created` in the Convex Auth new-account callback. Returning sign-ins and account linking do not emit another signup. Events retain the database creation time; retry deliveries retain the event UUID. Server geolocation is disabled because the backend's location is not the customer's country.
- Added [New production accounts](https://us.posthog.com/project/546847/insights/aMMNoHuN), filtered to production and excluding the existing Internal / Test users cohort.
- Added [Authenticated app visits](https://us.posthog.com/project/546847/insights/XgzlTibz). This counts unique accounts with `auth_completed`, which also occurs on authenticated cold starts. It is not a signup count or a complete measure of every foreground resume.
- Updated the internal cohort to include the verified owner email, preserving its previous internal flag and test-domain rules.
- Existing payment funnels retain production/test filtering and distinguish trials, restores, checkout success, and positive payments.
- One real development signup was observed in PostHog while the production signup query remained zero. The signup event begins on 8 September; no historical events were fabricated or backfilled.

The verified baseline is 13 production accounts including one confirmed owner/test account, two active trials, one promotional Pro entitlement, and no paid subscriptions. The remaining 12 accounts have not all been independently classified as external customers.

## Verification and rollout

- Backend changes deployed to development and production without deleting indexes. TypeScript and lint pass. The complete suite passed 398 tests across 33 files; focused checks passed after the final signup-property change.
- Simulator runtime confirmed the development build variant, development Convex URL, and new isolated RevenueCat key.
- RevenueCat's development webhook test returned HTTP 200.
- A disposable development account exercised successful monthly and annual Test Store purchases, cancellation, failed purchase, and restore. Successful purchases updated Convex to Pro. With the development anonymous-access bypass temporarily disabled, a server-gated Space creation failed before purchase and succeeded after purchase.
- The initial disposable account and its test Spaces were removed, and the original simulator RevenueCat identity was restored. These tests did not create production users or subscriptions and charged no money.
- Final published-paywall check: the simulator displayed USD 4.99/month and USD 19.99/year. Selecting Annual opened `annual_1999` with a one-week free trial. The paywall returned `PURCHASED`, and the webhook updated the fresh account to `trialing`. This separately verifies trial semantics after the initial no-trial Test Store checks.
- The trial account passed the server-gated Space action after purchase, then was deleted with its test data. Both disposable QA accounts were cleaned up. The simulator's original RevenueCat identity and `AUTH_ENABLE_ANONYMOUS=true` development setting were restored. The production payment receipt ledger remained empty; sandbox tests did not create production payment telemetry.

The native source/environment changes are active in the local development client and in future EAS builds. No new App Store or Play Store binary was submitted by this task. Existing installed binaries retain their bundled configuration until updated. Production client analytics still requires the instrumented native release described in `docs/analytics/payment-funnel.md`.

Test Store checks verify the SDK → RevenueCat → webhook → Convex path, not Apple's payment processing. A fresh real Apple sandbox/TestFlight purchase on a suitable signed-in device remains a release verification step. No physical Android device or iPhone was connected during this check.
