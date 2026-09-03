# CLAUDE.md

This file provides guidance when working with code in this repository.

@AGENTS.md (when present)

> Expo docs change quickly. Before writing native app code, read the versioned docs
> for the SDK pinned in `apps/native/package.json` (currently Expo SDK 55):
> https://docs.expo.dev/versions/v55.0.0/

## What this is

**Shelvr** is a "save-it-for-later" hub. Users capture links, images, and notes; a Convex
backend action fetches/extracts content and an LLM classifies each item (title, description,
tags, and which "spaces" it belongs to). Clients render a feed of saves. Items can be
organized into **spaces** (themed collections), and creating a new space retroactively pulls
in matching existing items.

## Monorepo layout

| Path          | Role                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| `apps/web`    | Next.js marketing / landing site; server routes may call Convex for waitlists |
| `apps/native` | Expo Router native app (includes `convex/` backend)                           |

Convex types/API are imported as `@convex/_generated/*` (path alias resolves to `./convex/*`).

## Toolchain & commands

**Use `pnpm`** (workspace package manager). Root scripts go through Turbo.

- `pnpm install` — install deps
- `pnpm dev` — run web + native via Turbo
- `pnpm typecheck` — typecheck all packages
- `pnpm --filter native-app start` — Expo Metro
- `pnpm --filter native-app exec convex dev` —
  Convex backend against the dev deployment; keeps `convex/_generated/*` in sync
- `pnpm --filter web-app dev` — Next.js dev server
- `pnpm --filter web-app lint` — ESLint

There is no test suite yet.

## Architecture

### Backend (`apps/native/convex/`) — source of truth

Convex is the reactive backend + database + file storage + AI orchestration. Auth is
[Convex Auth](https://labs.convex.dev/auth/) (`@convex-dev/auth`), configured in `convex/auth.ts`
and wired in `convex/auth.config.ts`. Convex Auth issues its own JWTs (signed with the
`JWT_PRIVATE_KEY` / `JWKS` deployment vars); the JWT `sub` contains the users-table id and session
id, and `model/auth.ts` extracts the stable users-table id used by every app table.

- **`schema.ts`** — the Convex Auth tables (`authTables`) plus `items`, `spaces`, `spaceItems`,
  `itemOperations`, and `subscriptions`. `items` has a `by_user` index and a `search_text` full-text
  search index (filtered by `userId`).
- **`items.ts`** — public queries/mutations (`listItems`, `getItem`, `searchItems`,
  `createItem`/`deleteItem`, `generateUploadUrl`) plus internal helpers the AI action calls.
  Image URLs are resolved from `storageId` at read time via `enrichItem` (`resolvedImageUrl`).
- **`spaces.ts`** — space CRUD + space/item join management.
- **`auth.ts`** — `convexAuth()` setup: Google + Apple OAuth (Auth.js providers) and an optional
  Anonymous provider (dev only, gated on `AUTH_ENABLE_ANONYMOUS`).
- **`users.ts`** — `getCurrentUser` query, used by the client for email display and RevenueCat
  identity sync.
- **`ai.ts`** (`"use node"` action) — the processing pipeline. On create, a mutation inserts the
  item as `status: "processing"` and schedules `internal.ai.processItem`. That action: for links,
  fetches the page and extracts the article body (Mozilla **Readability** via `linkedom`, with a
  regex fallback) + OpenGraph metadata + hero image aspect ratio (read from raw header bytes);
  for notes it feeds the content to the model. It calls `generateObject` (Vercel AI SDK, Zod
  schema) to produce title/description/tags/spaceNames, maps space names back to ids, then
  `finalizeItem` flips status to `ready`. `reclassifyForNewSpace` runs when a space is created.
- **`model/auth.ts`** — `requireUserId(ctx)` returns the stable Convex Auth users-table id (not the
  session-bearing JWT `sub`). **Every public function derives `userId` from this, never from a client
  argument.**

**The AI model** is `gemini-3.1-flash-lite`, called directly through the `@ai-sdk/google` provider
(auth via the `GOOGLE_GENERATIVE_AI_API_KEY` Convex deployment env var — an AI Studio API key).

When editing anything in `convex/`, prefer the `convex-expert` skill — object-form syntax,
`args` + `returns` validators on every function, index-backed reads only.

### Web (`apps/web`)

- Next.js App Router marketing site only (no auth or product UI); server routes may call Convex
  for marketing forms such as platform waitlists
- Landing page at `/` — product experience lives in the native app

### Native (`apps/native`)

- Expo Router under `src/app`, with `(auth)` and `(app)` groups
- Convex Auth via `ConvexAuthProvider` (`@convex-dev/auth/react`) in `src/app/_layout.tsx`,
  backed by `expo-secure-store` token storage; `useConvexAuth()` (from `convex/react`) guards the
  `(auth)` / `(app)` route groups
- Screens: home feed, save item, item detail, spaces list/detail
- Scheme / bundle id: `shelvr` / `app.shelvr.save`

## Path aliases

- Web: `@/*` → `apps/web/src/*`
- Native: `@/*` → `apps/native/src/*`, `@convex/*` → `apps/native/convex/*`
- Import Convex API as `@convex/_generated/api`

## Environment variables

**Client**

- Web: `CONVEX_URL` is optional unless a server-backed marketing form is enabled; no auth env vars
- Native (`.env.local`): `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS` (optional,
  mirrors the backend `AUTH_ENABLE_ANONYMOUS` to show the dev-only passwordless button)

**Convex deployment** (via `convex env set` or dashboard):

- `JWT_PRIVATE_KEY` / `JWKS` — RS256 keypair Convex Auth uses to sign its JWTs (generate via
  `node generateKeys.mjs`, see [Manual Setup](https://labs.convex.dev/auth/setup/manual))
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth client credentials
- `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` — Sign-in-with-Apple Service ID + signed JWT secret
- `AUTH_ENABLE_ANONYMOUS` — set to `"true"` on the dev deployment only to enable passwordless
  dev sign-in
- `GOOGLE_GENERATIVE_AI_API_KEY` — Google AI Studio API key for classification (used directly by
  `@ai-sdk/google`, no gateway)
- `REVENUECAT_WEBHOOK_SECRET` — shared bearer secret authenticating RevenueCat webhook posts
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` — RevenueCat public SDK
  keys (client-side; entitlement stays `none` until these are set and a subscription row is written)

## Working conventions

- Do not reintroduce the old notes-app domain (`notes` table, OpenAI summary action, `/notes`
  routes). The product domain is **items + spaces**.
- Never pass `userId` from the client into Convex public functions.
- Keep `returns:` validators accurate — Convex enforces them at runtime.
- Prefer `withIndex` / search indexes over `.filter()` on growing tables.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`apps/native/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `apps/native`.

<!-- convex-ai-end -->
