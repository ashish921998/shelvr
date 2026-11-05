# Environment variables

Every variable the web app, the native app and the Convex deployment read.

**Client**

- Web (`apps/web/.env.example`): `CONVEX_URL` is optional unless a server-backed marketing form
  is enabled. No auth env vars
- Web: `CONVEX_SITE_URL`: HTTP Actions origin (`*.convex.site`) for the server routes. When
  empty it is derived from `CONVEX_URL` when that URL contains `.convex.cloud`. The Android
  waitlist route answers 503 when neither gives an origin or `WAITLIST_SHARED_SECRET` is unset
- Web: `WAITLIST_SHARED_SECRET`: must equal the Convex deployment's `WAITLIST_SHARED_SECRET`.
  The web server routes (waitlist, plan votes, the reel place finder, the Oracle) send it to
  the Convex HTTP routes. The web server also signs Oracle share links with it, and
  `/oracle/og` answers 503 without it
- Web: `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `NEXT_PUBLIC_POSTHOG_HOST`: web analytics keys.
  Analytics is a no-op when either is unset
- Web: `NEXT_PUBLIC_APP_STORE_PROVIDER_TOKEN`: optional App Store Connect provider token. With
  it, App Store links carry `ct=` campaign tokens; see
  [growth funnel](../analytics/growth-funnel.md)
- Native (copy `apps/native/.example.env` to `.env.local`):
  - `APP_VARIANT`: `development` (default), `preview` or `production`. Picks the bundle id
    suffix, scheme, icon and which keys `app.config.js` accepts. The EAS profiles set it
  - `ANDROID_BUILD_ARCHS`: optional comma-separated Android ABIs. Unset, production builds
    `arm64-v8a,armeabi-v7a` and other variants add `x86,x86_64`. The EAS profiles and the
    native-update workflow set it
  - `EXPO_PUBLIC_CONVEX_URL`: the Convex deployment URL the client connects to. `app.config.js`
    rejects the production URL on dev and preview builds
  - `EXPO_PUBLIC_CONVEX_SITE_URL`: the deployment's HTTP Actions origin
  - `EXPO_PUBLIC_WEB_URL`: optional web origin for plan voting links. Local QA uses
    a web server connected to the same development Convex backend; unset uses the
    production website.
  - `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS`: optional, mirrors the backend `AUTH_ENABLE_ANONYMOUS`
    to show the passwordless dev-login button and fixture reset on development builds
    (release-mode included); preview and production builds never show either
  - `EXPO_PUBLIC_REVENUECAT_TEST_KEY`: RevenueCat Development Test Store key used by
    non-production debug builds only; release-mode dev and preview builds skip RevenueCat
    configuration because the SDK rejects test keys outside debug. `app.config.js` pins it
    to one exact value
  - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`: RevenueCat public
    SDK keys used only by production builds. The entitlement stays `none` until a key is set and
    a subscription row is written
  - `GOOGLE_MAPS_API_KEY`: Google Maps key injected into the Android config, needed by
    `expo-maps` on the map screen. A production Android EAS build fails without it, so the map
    screen never ships unconfigured
  - `GOOGLE_SERVICES_JSON`: EAS secret file variable containing Firebase's
    `google-services.json`; required by every Android EAS build, with a Firebase
    client matching that variant's package, so `expo-notifications` can obtain an
    FCM token. See [push notification builds and updates](push-notifications.md)
    for credentials, rebuilding existing installs, and OTA fingerprint consistency
  - `POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST`: build-time PostHog config baked into
    `expoConfig.extra`. The client analytics module is undefined unless both resolve
  - `POSTHOG_CLI_API_KEY`: PostHog personal API key (scopes: error tracking write, organization
    read). `app.config.js` adds the `posthog-react-native/expo` source map upload plugin only when
    this is set, so a build without it keeps working and uploads switch on the moment the EAS
    secret is added. The upload runs inside the native build and needs `@posthog/cli` available
    there, plus `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST` set beside it as EAS environment
    variables. Turning the upload on adds a config plugin, so it moves the fingerprint and needs a
    store build.
    `metro.config.js` stamps the matching debug id into every bundle regardless

**Convex deployment** (via `convex env set` or dashboard). The app-owned names are declared in
`apps/native/convex/convex.config.ts`; Convex Auth reads its `JWT_PRIVATE_KEY`, `JWKS`, and
`AUTH_*` variables itself. Only `GOOGLE_GENERATIVE_AI_API_KEY` is marked required there, so a
deploy fails without it. The auth and integration variables are optional at deploy time and are
needed at runtime by the features that use them:

- `JWT_PRIVATE_KEY` / `JWKS`: RS256 keypair Convex Auth uses to sign its JWTs (generate via
  `node generateKeys.mjs`, see [Manual Setup](https://labs.convex.dev/auth/setup/manual))
- `CONVEX_SITE_URL`: set by Convex; `auth.config.ts` uses it as the JWT issuer domain
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`: Google OAuth client credentials
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET`: Sign-in-with-Apple Service ID + signed JWT secret
- `APPLE_RETENTION_MESSAGE_ID`: id of the Apple-approved retention message
  `/retention-messaging` names on the cancel sheet. Unset, the reply is empty and Apple shows
  the default message configured for the product
- `APPLE_RETENTION_OFFERS`: JSON from product id to `{ offerIdentifier, messageIdentifier }`.
  A listed product gets that App Store Connect promotional offer on the cancel sheet, signed
  for the subscriber's original transaction; any other product gets the plain message
- `APPLE_IAP_PRIVATE_KEY` / `APPLE_IAP_KEY_ID` / `APPLE_IAP_ISSUER_ID`: the Apple In-App
  Purchase key (`.p8` contents), its key id and issuer id, which sign those offers. Unset,
  `/retention-messaging` sends the plain message and logs `retention_offer_skipped`
- `APPLE_REVOKE_PRIVATE_KEY` / `APPLE_REVOKE_KEY_ID` / `APPLE_REVOKE_TEAM_ID`: the Sign in
  with Apple key (`.p8` contents), its key id, and the Apple team id. `appleRevoke.ts` signs
  the client secret with them to revoke a deleted account's Apple token. All optional:
  without them deletion still completes and the revocation is skipped with a log line
- `APPLE_MAPS_PRIVATE_KEY` / `APPLE_MAPS_KEY_ID` / `APPLE_MAPS_TEAM_ID`: a MapKit key
  (`.p8` contents), its key id, and the Apple team id. `trips.ts` signs the Apple Maps Server
  API token with them to pin a trip's stops (free up to 25,000 calls a day per team; past
  that Apple answers 429 and stops show without pins). All optional: without them trips have
  no pins
- `AUTH_ENABLE_ANONYMOUS`: set to `"true"` on the dev deployment only to enable passwordless
  dev sign-in and the fixture reset in `devFixtures.ts`
- `GOOGLE_GENERATIVE_AI_API_KEY`: Google AI Studio API key for classification (used directly by
  `@ai-sdk/google`, no gateway). The only required entry
- `E2E_FAKE_AI`: set to `local-v1` only by the `e2e ios` workflow's local backend. It swaps
  Gemini for the deterministic fake in `model/fakeAi.ts` (which also serves its fixture pages
  at `https://fixtures.e2e.invalid/` to link saves, reads cities and places off them, and
  answers plan calls), and only when the backend is on
  127.0.0.1, `AUTH_ENABLE_ANONYMOUS` is `"true"` and the model key is the `ci-no-model`
  placeholder. Anywhere else it is refused and logged as `fake_ai_refused`
- `POSTHOG_PROJECT_TOKEN`: server-side PostHog ingestion key. All backend capture is skipped
  when it is unset
- `POSTHOG_HOST`: PostHog ingestion host. Defaults to `https://us.i.posthog.com`
- `OBSERVABILITY_ENV`: tags captured events with an `environment` property. Set it to
  `production` on the production deployment
- `REVENUECAT_WEBHOOK_SECRET`: shared bearer secret authenticating RevenueCat webhook posts.
  The route answers 500 when it is unset
- `REVENUECAT_API_KEY`: RevenueCat REST key used to re-read subscribers when reconciling a
  `TRANSFER`, `BILLING_ISSUE`, refund, `REFUND_REVERSED` or `EXPIRATION` webhook event (an expiring
  product says nothing about a dated grant that still covers the account). Those reconciliations return
  503 without this key so RevenueCat retries instead of leaving access silently out of sync
- `REVENUECAT_ENTITLEMENT_ID`: entitlement name read from the RevenueCat subscriber snapshot.
  Defaults to `Shelvr Pro`
- `SAVE_REMINDERS_ENABLED`: save reminders send only while this is `"true"`. Unset by
  default, so a deploy never starts them; set it back to anything else to stop them, queued
  ones included, without a deploy. See
  [contextual notifications](contextual-notifications.md)
- `FREE_SAVES_ENABLED`: the free plan's 10 saves (`freeSaves.ts`) work only while this is
  `"true"`. Unset, every save without Pro is refused as before
- `SERPAPI_KEY`: SerpAPI key for `findProductLinks`. The search fails without it
- `YOUTUBE_API_KEY` — optional YouTube Data API v3 key for video descriptions and metadata.
  Missing key, quota/auth rejection, network failure or unusable responses preserve the existing
  oEmbed fallback; oEmbed-only metadata never enables caption recipe extraction.
- `TREG_API_KEY` / `VIDEO_TRANSCRIPTS_ENABLED`: Treg token for the spoken transcript of a
  cooking TikTok or reel whose caption has no recipe, or one that recommends or visits places
  (`model/videoTranscript.ts`, about $0.002
  each, rate limited per user and globally). The same pair pays for a TikTok's caption when
  oEmbed returns none (`model/readers/tiktok.ts`, about $0.002 each, its own per-user limit,
  the shared global one; the web reel finder has its own budget). Both are fetched only while the switch is `"true"` and the key is
  set; set the switch to anything else to stop them with no deploy
- `WAITLIST_SHARED_SECRET`: shared secret the web server sends to the Convex HTTP routes it
  calls. Set the same value on the web deployment. Unset, `/waitlist/join`, `/reel-places`,
  `/oracle` and `/plan/votes` answer 500, and `/request-body` and `/waitlist/confirm`
  answer 401
- `RESEND_API_KEY`: Resend key for the waitlist contact projection. Without it, rows stay
  `unconfigured` and no attempt is spent
- `RESEND_SEGMENT_ID`: Resend segment for `shelvr` waitlist signups
- `RESEND_ANDROID_SEGMENT_ID`: Resend segment for `shelvr-android` signups. Android rows stay
  `unconfigured` until it is set
- `RESEND_TOPIC_ID`: Resend topic the contact is opted into
- `RESEND_FEEDBACK_INBOX_EMAIL`: Resend address in-app feedback is projected to. Together with
  `RESEND_FEEDBACK_FROM_EMAIL` and `RESEND_API_KEY` it gates configured delivery; submissions stay
  `unconfigured` until all three are set
- `RESEND_FEEDBACK_FROM_EMAIL`: verified Resend sending address for feedback email, required with
  the inbox address and `RESEND_API_KEY` for delivery
