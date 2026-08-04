# Amber

Amber is a save-for-later hub. Capture links, images, and notes; Convex + an LLM
classify each item (title, description, tags, spaces). Everything lands in a
searchable feed, organized into themed **spaces**.

This monorepo was bootstrapped from the
[Convex monorepo template](https://www.convex.dev/templates/monorepo) and reshaped
for Amber.

## Stack

- [Turborepo](https://turbo.build/repo) + [pnpm](https://pnpm.io/)
- [Next.js](https://nextjs.org/) (`apps/web`)
- [Expo](https://docs.expo.dev/) + Expo Router (`apps/native`)
- [Convex](https://convex.dev/) (`packages/backend`)
- [Clerk](https://clerk.com/) auth
- Vercel AI SDK via AI Gateway (`google/gemini-3.1-flash-lite`)

## What’s inside

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js marketing site + authenticated app (`/app`) |
| `apps/native` | Expo native client |
| `packages/backend` | Convex schema, queries/mutations, AI pipeline |

## Quick start

### 1. Install

```sh
pnpm install
```

### 2. Configure Convex

```sh
pnpm --filter @packages/backend setup
```

This logs you into Convex, connects a project, and writes
`packages/backend/.env.local`.

### 3. Clerk ↔ Convex

Follow the [Convex + Clerk guide](https://docs.convex.dev/auth/clerk).

In Clerk, enable the Convex JWT template (`applicationID: "convex"`). Set the
issuer on your Convex deployment:

```sh
pnpm --filter @packages/backend exec convex env set CLERK_JWT_ISSUER_DOMAIN https://your-frontend-api.clerk.accounts.dev
```

For AI classification, also set:

```sh
pnpm --filter @packages/backend exec convex env set AI_GATEWAY_API_KEY <your-vercel-ai-gateway-key>
```

### 4. App env files

Copy the example env files:

```sh
cp apps/web/.example.env apps/web/.env.local
cp apps/native/.example.env apps/native/.env.local
```

- `NEXT_PUBLIC_CONVEX_URL` / `EXPO_PUBLIC_CONVEX_URL` → `CONVEX_URL` from
  `packages/backend/.env.local`
- Clerk publishable key in both apps
- `CLERK_SECRET_KEY` in `apps/web/.env.local`

### 5. Run

```sh
pnpm dev
```

Runs backend, web, and native via Turbo.

## Domain model (Convex)

- **`items`** — saved links / images / notes (`processing` → `ready` | `failed`)
- **`spaces`** — themed collections owned by a user
- **`spaceItems`** — join table

Public APIs live in `items.ts` and `spaces.ts`. The Node action pipeline is in
`ai.ts` (`processItem`, `reclassifyForNewSpace`). Auth always derives `userId`
from Clerk via `model/auth.ts` — never from a client argument.

## Deploying web

```sh
cd packages/backend && pnpm exec convex deploy --cmd 'cd ../../apps/web && pnpm build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
```

`apps/web/vercel.json` is set up for this flow on Vercel.

## Adding dependencies

Install in the package that uses them:

```sh
pnpm --filter web-app add mypackage@latest
pnpm --filter native-app add mypackage@latest
pnpm --filter @packages/backend add mypackage@latest
```

## Notes

- Native routes live under `apps/native/src/app`
- Web app routes are under `/app` (Clerk-protected via `apps/web/src/proxy.ts`)
- See root `CLAUDE.md` for architecture guidance when working with agents
