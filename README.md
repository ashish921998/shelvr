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
- [Clerk](https://clerk.com/) auth (native + Convex)
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

### 3. Clerk ↔ Convex

Follow the [Convex + Clerk guide](https://docs.convex.dev/auth/clerk).

In Clerk, enable the Convex JWT template (`applicationID: "convex"`). Set the
issuer on your Convex deployment:

```sh
cd apps/native && npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-frontend-api.clerk.accounts.dev
```

For AI classification, also set:

```sh
cd apps/native && npx convex env set AI_GATEWAY_API_KEY <your-vercel-ai-gateway-key>
```

### 4. Native env

```sh
cp apps/native/.example.env apps/native/.env.local
```

- `EXPO_PUBLIC_CONVEX_URL` → `CONVEX_URL` from `apps/native/.env.local`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from the Clerk dashboard

The web marketing site needs no env vars.

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
from Clerk via `model/auth.ts` — never from a client argument.

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
