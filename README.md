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
- Vercel AI SDK via AI Gateway (`google/gemini-3.1-flash-lite`)

## What’s inside

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js marketing / landing site |
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

For AI classification, also set:

```sh
cd apps/native && npx convex env set AI_GATEWAY_API_KEY <your-vercel-ai-gateway-key>
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

The web marketing site needs these variables for its launch waitlist and
conversion experiment (copy `apps/web/.env.example` to
`apps/web/.env.local`):

```sh
CONVEX_URL=<deployment-url>
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<project-token>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

`CONVEX_URL` is the Convex deployment the waitlist route submits to; without
it the route returns 503 and the form shows a "try again shortly" message.
PostHog is optional; without its public variables, waitlist signup still works
and web analytics become a no-op. `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` are
reserved for the waitlist backend (shipped separately on the Convex side),
which will store confirmed signups in a Resend audience.

### 5. Run

```sh
pnpm dev
```

Runs backend, web (landing), and native via Turbo.

## Domain model (Convex)

- **`items`** — saved links / images / notes (`processing` → `ready` | `failed`)
- **`spaces`** — themed collections owned by a user
- **`spaceItems`** — join table

Public APIs live in `items.ts` and `spaces.ts`. The Node action pipeline is in
`ai.ts` (`processItem`, `reclassifyForNewSpace`). Auth always derives `userId`
from Convex Auth via `model/auth.ts` (the stable users-table id extracted from the
session-bearing JWT `sub`) — never from a client argument.

## Deploying web

The marketing site is a plain Next.js build — no Convex URL injection required:

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
