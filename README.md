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

## What’s inside

| Path          | Purpose                                            |
| ------------- | -------------------------------------------------- |
| `apps/web`    | Next.js marketing / landing site                   |
| `apps/native` | Expo native client (full product) + Convex backend |

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
EXPO_PUBLIC_REVENUECAT_IOS_KEY=<ios-sdk-key>
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=<android-sdk-key>
```

### 4. Native env

```sh
cp apps/native/.example.env apps/native/.env.local
```

- `EXPO_PUBLIC_CONVEX_URL` → `CONVEX_URL` from `apps/native/.env.local`
- `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` → `true` to mirror the dev-only backend flag
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` → RevenueCat SDK keys
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

Runs backend, web (landing), and native via Turbo.

## Domain model (Convex)

- **`items`** — saved links / images / notes (`processing` → `ready` | `failed`)
- **`spaces`** — themed collections owned by a user
- **`spaceItems`** — join table
- **`waitlistSignups`** — platform availability waitlists and prior launch records

Public product APIs live in `items.ts` and `spaces.ts`. The Node action pipeline
is in `ai.ts` (`processItem`, `reclassifyForNewSpace`). Auth always derives `userId`
from Convex Auth via `model/auth.ts` (the stable users-table id extracted from the
session-bearing JWT `sub`) — never from a client argument.

## Deploying web

The marketing site is a Next.js build. Android waitlist signup needs
`CONVEX_URL` at runtime:

```sh
pnpm --filter web-app build
```

`apps/web/vercel.json` uses `turbo run build`.

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
