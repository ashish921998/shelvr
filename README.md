# Shelvr

Shelvr is a save-for-later hub. Capture links, images, and notes; Convex + an LLM
classify each item (title, description, tags, spaces). Everything lands in a
searchable feed, organized into themed **spaces**.

The product is **mobile-first**: the native app is the full experience. The web
site is marketing only.

This monorepo was bootstrapped from the
[Convex monorepo template](https://www.convex.dev/templates/monorepo) and reshaped
for Shelvr.

## Stack

- [Turborepo](https://turbo.build/repo) + [pnpm](https://pnpm.io/)
- [Next.js](https://nextjs.org/) (`apps/web`) — marketing landing only
- [Expo](https://docs.expo.dev/) + Expo Router (`apps/native`) — product app
- [Convex](https://convex.dev/) (`apps/native/convex/`)
- [Convex Auth](https://labs.convex.dev/auth/) (Google + Apple OAuth, dev Anonymous)
- Vercel AI SDK with the direct Google provider (`gemini-3.1-flash-lite`)
- [Vitest](https://vitest.dev/) + [`convex-test`](https://docs.convex.dev/testing/convex-test)
  for the native app and the Convex backend
- A plain Manifest V3 browser extension (`apps/extension`) — no build step

## What’s inside

| Path             | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `apps/web`       | Next.js marketing / landing site                          |
| `apps/native`    | Expo native client (full product) + Convex backend        |
| `apps/extension` | Browser extension for saving links from a desktop browser |

## Quick start

### 1. Install

```sh
pnpm install
```

### 2. Configure Convex

```sh
cd apps/native && npx convex dev --until-success
```

This logs you into Convex, connects a project, and writes
`apps/native/.env.local`.

### 3. Convex Auth

Follow the [Convex Auth setup guide](https://labs.convex.dev/auth/setup/manual).

Generate the JWT signing keypair and set it on the deployment:

```sh
cd apps/native && node generateKeys.mjs   # prints JWT_PRIVATE_KEY + JWKS
# paste both into the Convex dashboard Environment Variables
```

Configure the OAuth provider env vars (Google + Apple). See the
[Google](https://labs.convex.dev/auth/config/oauth/google) and
[Apple](https://labs.convex.dev/auth/config/oauth/apple) guides for the callback
URL format (`<CONVEX_SITE_URL>/api/auth/callback/<provider>`).

```sh
cd apps/native && npx convex env set AUTH_GOOGLE_ID <id>
cd apps/native && npx convex env set AUTH_GOOGLE_SECRET <secret>
cd apps/native && npx convex env set AUTH_APPLE_ID <service-id>
cd apps/native && npx convex env set AUTH_APPLE_SECRET <jwt-secret>
```

For local dev only, enable the passwordless Anonymous sign-in button:

```sh
cd apps/native && npx convex env set AUTH_ENABLE_ANONYMOUS true
```

For AI classification, set a Google AI Studio API key on each Convex deployment.
Convex environment variables are deployment-specific, so production needs the
explicit `--prod` command even when development is already configured:

```sh
cd apps/native && npx convex env set GOOGLE_GENERATIVE_AI_API_KEY <your-google-ai-studio-key>
cd apps/native && npx convex env set --prod GOOGLE_GENERATIVE_AI_API_KEY <your-google-ai-studio-key>
```

AI categorization observability is sent server-side to PostHog. Configure the
same variables on development and production (`--prod`):

```sh
cd apps/native && npx convex env set POSTHOG_PROJECT_TOKEN <posthog-project-token>
cd apps/native && npx convex env set POSTHOG_HOST https://us.i.posthog.com
cd apps/native && npx convex env set OBSERVABILITY_ENV development
cd apps/native && npx convex env set --prod POSTHOG_PROJECT_TOKEN <posthog-project-token>
cd apps/native && npx convex env set --prod POSTHOG_HOST https://us.i.posthog.com
cd apps/native && npx convex env set --prod OBSERVABILITY_ENV production
```

The pipeline emits `ai_categorization_succeeded`, `_partial`, `_not_found`, and
`_failed` with provider, model, item type, duration, environment, and a sanitized
error category when relevant. It never sends item content, URLs, item ids, or
user identifiers.

For the RevenueCat webhook, also set:

```sh
cd apps/native && npx convex env set REVENUECAT_WEBHOOK_SECRET <webhook-secret>
```

For RevenueCat (Pro entitlements), set the platform SDK keys in the native env:

```sh
# apps/native/.env.local
EXPO_PUBLIC_REVENUECAT_TEST_KEY=test_VOYicTvOGPXCBFMVdHzyxRndiRi
# Production builds only:
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<ios-sdk-key>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<android-sdk-key>
```

### 4. Native env

```sh
cp apps/native/.example.env apps/native/.env.local
```

- `EXPO_PUBLIC_CONVEX_URL` → `CONVEX_URL` from `apps/native/.env.local`
- `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` → `true` to mirror the dev-only backend flag
- `EXPO_PUBLIC_REVENUECAT_TEST_KEY` → isolated Shelvr Development Test Store key from `.example.env`, used by local development and preview on both platforms. Use the development Convex deployment (`amicable-antelope-639`), never production.
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` → production-only RevenueCat SDK keys
- `ACTIVATION_PAL_IOS_KEY` → ActivationPal public app key embedded in iOS builds

The web marketing site uses the Convex deployment for its Android waitlist;
analytics are optional (copy `apps/web/.env.example` to
`apps/web/.env.local`):

```sh
CONVEX_URL=<deployment-url>
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<project-token>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Without `CONVEX_URL`, the Android waitlist route returns 503. Without the
PostHog public variables, signup and App Store downloads still work and web
analytics become a no-op. Waitlist rows are stored in Convex and optionally
synced to Resend. Set `RESEND_API_KEY` and `RESEND_ANDROID_SEGMENT_ID` on the
Convex deployment to add Android signups to a dedicated Resend segment.

### 5. Run

```sh
pnpm dev
```

Runs web (landing) and native via Turbo. It does not start the Convex backend.
Run the backend in a second terminal:

```sh
pnpm --filter native-app exec convex dev
```

### 6. Test

```sh
pnpm --filter native-app test    # vitest run
pnpm --filter web-app test       # vitest run
pnpm run coverage                 # native and web Vitest coverage gates
pnpm --filter native-app check   # lint, then typecheck, then test
```

Tests are `*.test.ts` files next to the code under `apps/native/convex/`,
`apps/native/src/`, and `apps/web/src/`. Convex function tests use `convex-test`
and opt into the edge runtime per file with a
`// @vitest-environment edge-runtime` pragma. Web tests use Vitest's Node
environment by default and opt into jsdom per file when browser APIs are needed.

## Domain model (Convex)

- **`items`** — saved links / images / notes (`processing` → `ready` | `failed`)
- **`spaces`** — themed collections owned by a user
- **`spaceItems`** — join table, with a `suggested` / `saved` / `dismissed` status
- **`itemOperations`** — per-import idempotency ledger
- **`subscriptions`** — one Pro entitlement row per user
- **`notificationDevices`** / **`notificationPreferences`** / **`weeklyDigests`** /
  **`itemReads`** — push tokens, weekly shelf settings, shelves, and read state
- **`waitlistSignups`** — platform availability waitlists and prior launch records
- **`extensionPairings`** / **`extensionConnections`** — browser-extension pairing codes and
  the browsers they connected, both stored as hashes only

Public product APIs live in `items.ts`, `spaces.ts`, `subscriptions.ts`,
`notifications.ts`, `extension.ts`, and `users.ts`. The Node action pipeline is in `ai.ts`
(`processItem`, `recommendForSpace`, `steerItemForSpace`, `findProductLinks`).
Auth always derives `userId` from Convex Auth via
`model/auth.ts` (the stable users-table id extracted from the session-bearing
JWT `sub`) — never from a client argument.

## Browser extension

`apps/extension` is a Manifest V3 extension that saves the page you're reading —
from the toolbar, `Ctrl/Cmd+Shift+S`, or the right-click menu — through the same
pipeline as a save from the phone. There is nothing to install or build: load the
directory unpacked from `chrome://extensions`.

It cannot sign in the way the app does, so the signed-in app vouches for the
browser instead. **Profile → Browser extension** shows an eight-character code,
good for ten minutes and usable once; typing it into the extension's popup trades
it for a bearer token at `POST /extension/pair`. The server keeps only a SHA-256
of that token, so the copy in the browser is the only one — a lost token is
re-paired, never recovered. Revoke a browser from the app's list or from the
popup's **Disconnect**.

See [`apps/extension/README.md`](apps/extension/README.md) for the permissions it
asks for and how to point it at a dev deployment.

## Deploying

**Web** deploys itself: Vercel's Git integration builds and publishes every
commit on `main` (`apps/web/vercel.json` sets `turbo run build` as the build
command). Android waitlist signup needs `CONVEX_URL` at runtime:

```sh
pnpm --filter web-app build
```

**Convex production** deploys through the Deploy workflow
(`.github/workflows/deploy.yml`). After CI completes on `main` it deploys the
backend, and nothing else. It does not ask for approval: what holds the line is
CI, the freshness check in every job that acts, and the public-contract check
on the pull request that got the commit onto `main`. One-time setup is a deploy
key from the Convex dashboard (production deployment → Settings → Deploy keys),
added as the `CONVEX_DEPLOY_KEY` repo secret.

No client update ships from here. Testers and users get a build or an OTA from
the Release workflow below, which deploys the same commit's backend first, so a
client never reaches anyone ahead of the functions it calls.

**Store builds and production OTA** run through the Release workflow
(`.github/workflows/release.yml`), dispatched manually from `main`: mode
`build` runs `eas build` for the chosen platform/profile (`--auto-submit`
once store credentials are configured on EAS; Android submits also need the
`EAS_GOOGLE_SERVICE_ACCOUNT_KEY` repo secret — the base64 of the Play API
JSON key), mode `ota` publishes an EAS Update to the `production` channel.
Both manual workflows require successful push CI for the selected `main`
commit. Release deploys that commit's Convex backend before building or
publishing, and shares Deploy's concurrency group to prevent interleaving.
Release therefore also requires `CONVEX_DEPLOY_KEY`.
Non-main dispatches fail with a branch-selection error. Before queueing any
build with iOS submission enabled, Release verifies that EAS has a submission
API key assigned to the production bundle and Apple team. Configure it with
`eas credentials --platform ios` under the production profile's App Store
Connect / EAS Submit settings. This checks the assignment, not revocation
or permissions on Apple's servers.

**OTA publishes require the EAS `production` environment.** With
`--environment production`, updates use that environment's plaintext and
sensitive variables; Secret values are unavailable. Both workflows pull the
readable values into a temporary file and validate the production Convex
deployment/site URLs and the iOS/Android RevenueCat public keys before
publishing. Set them with `eas env:set --name <name> --value <value>
--environment production --visibility sensitive`. The temporary file is
deleted after validation, and validation errors never include values.
The verifier also requires readable, nonempty `GOOGLE_MAPS_API_KEY`,
`POSTHOG_PROJECT_TOKEN`, and an HTTPS `POSTHOG_HOST`. Set these explicitly
with plaintext or sensitive visibility in EAS production so builds and
updates use the same config inputs. Both environment validation and OTA
publication pin `APP_VARIANT=production`.

**Fingerprint rule:** OTA updates reach installs by EAS fingerprint. Any
change that alters it — a native dependency added or removed, a native
config change — makes new updates invisible to binaries built from the old
fingerprint. Cut a fresh store build before resuming OTA publishes.

Ordering rule: installed clients update on their own schedule, so deploy
backend changes the clients can tolerate first. Never push a Convex change an
installed client can't survive — ship breaking changes as expand/contract
(add the tolerant version, tighten once old clients are gone).

## Adding dependencies

Install in the package that uses them:

```sh
pnpm --filter web-app add mypackage@latest
pnpm --filter native-app add mypackage@latest
```

## Notes

- Native routes live under `apps/native/src/app`
- Web is marketing only at `/` — no authenticated `/app` product surface
- See root `CLAUDE.md` for architecture guidance when working with agents
- `assets/splash-blank.png` is a 1x1 transparent PNG and is meant to stay that
  way. On iOS the `expo-splash-screen` plugin applies `backgroundColor` only
  from inside `applyImageToSplashScreenXML`, which it calls only when `image`
  is set (`withIosSplashScreenStoryboardImage.js`, `Boolean(splash.image)`).
  With no `image` the generated storyboard keeps the bare template's
  `systemBackgroundColor` — white or black — and the configured colour is
  silently ignored, even though the colorset is still written. Shelvr wants the
  brand ground with no mark, because the animated splash draws its own S at
  1.05s and a static one here would appear, vanish, then pop back. The blank
  image buys the background; `imageWidth: 1` keeps it invisible. Verify after
  changing it: the generated `ios/Shelvr/SplashScreen.storyboard` must say
  `<color key="backgroundColor" name="SplashScreenBackground"/>`, not
  `systemBackgroundColor`.
