# CLAUDE.md

This file provides guidance when working with code in this repository.

@AGENTS.md (when present)

> Expo docs change quickly. Before writing native app code, read the versioned docs
> for the SDK pinned in `apps/native/package.json` (currently Expo SDK 55):
> https://docs.expo.dev/versions/v55.0.0/

## What this is

**Amber** is a "save-it-for-later" hub. Users capture links, images, and notes; a Convex
backend action fetches/extracts content and an LLM classifies each item (title, description,
tags, and which "spaces" it belongs to). Clients render a feed of saves. Items can be
organized into **spaces** (themed collections), and creating a new space retroactively pulls
in matching existing items.

## Monorepo layout

| Path | Role |
| --- | --- |
| `apps/web` | Next.js marketing site + authenticated app at `/app` |
| `apps/native` | Expo Router native app |
| `packages/backend` | Convex backend (schema, functions, AI pipeline) |

Shared Convex types/API are imported as `@packages/backend/convex/_generated/*`.

## Toolchain & commands

**Use `pnpm`** (workspace package manager). Root scripts go through Turbo.

- `pnpm install` — install deps
- `pnpm dev` — run backend + web + native via Turbo
- `pnpm typecheck` — typecheck all packages
- `pnpm --filter @packages/backend dev` / `pnpm --filter @packages/backend exec convex dev` —
  Convex backend against the dev deployment; keeps `convex/_generated/*` in sync
- `pnpm --filter native-app start` — Expo Metro
- `pnpm --filter web-app dev` — Next.js dev server
- `pnpm --filter web-app lint` — ESLint

There is no test suite yet.

## Architecture

### Backend (`packages/backend/convex/`) — source of truth

Convex is the reactive backend + database + file storage + AI orchestration. Auth is Clerk,
wired via `auth.config.ts` (Clerk JWT template `applicationID: "convex"`).

- **`schema.ts`** — three tables: `items`, `spaces`, and the `spaceItems` join table. `items`
  has a `by_user` index and a `search_text` full-text search index (filtered by `userId`).
- **`items.ts`** — public queries/mutations (`listItems`, `getItem`, `searchItems`,
  `createItem`/`deleteItem`, `generateUploadUrl`) plus internal helpers the AI action calls.
  Image URLs are resolved from `storageId` at read time via `enrichItem` (`resolvedImageUrl`).
- **`spaces.ts`** — space CRUD + space/item join management.
- **`ai.ts`** (`"use node"` action) — the processing pipeline. On create, a mutation inserts the
  item as `status: "processing"` and schedules `internal.ai.processItem`. That action: for links,
  fetches the page and extracts the article body (Mozilla **Readability** via `linkedom`, with a
  regex fallback) + OpenGraph metadata + hero image aspect ratio (read from raw header bytes);
  for notes it feeds the content to the model. It calls `generateObject` (Vercel AI SDK, Zod
  schema) to produce title/description/tags/spaceNames, maps space names back to ids, then
  `finalizeItem` flips status to `ready`. `reclassifyForNewSpace` runs when a space is created.
- **`model/auth.ts`** — `requireUserId(ctx)` returns the Clerk `sub`. **Every public function
  derives `userId` from this, never from a client argument.**

**The AI model** is `google/gemini-3.1-flash-lite`, a bare model-id string that routes through the
**Vercel AI Gateway** (auth via the `AI_GATEWAY_API_KEY` Convex deployment env var).

When editing anything in `convex/`, prefer the `convex-expert` skill — object-form syntax,
`args` + `returns` validators on every function, index-backed reads only.

### Web (`apps/web`)

- Next.js App Router + Clerk + `ConvexProviderWithClerk`
- Marketing landing at `/`; authenticated product at `/app`, `/app/items/[itemId]`,
  `/app/spaces`, `/app/spaces/[spaceId]`
- Route protection via `src/proxy.ts` (`/app(.*)`)

### Native (`apps/native`)

- Expo Router under `src/app`, with `(auth)` and `(app)` groups
- Clerk Expo + `ConvexProviderWithClerk` in `ConvexClientProvider.tsx`
- Screens: home feed, save item, item detail, spaces list/detail
- Scheme / bundle id: `amber` / `app.amber.save`

## Path aliases

- Web: `@/*` → `apps/web/src/*`
- Backend package: `@packages/backend` → `packages/backend`
- Import Convex API as `@packages/backend/convex/_generated/api`

## Environment variables

**Client**

- Web (`.env.local`): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONVEX_URL`,
  `CLERK_SECRET_KEY`
- Native (`.env.local`): `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`

**Convex deployment** (via `convex env set` or dashboard):

- `CLERK_JWT_ISSUER_DOMAIN` — Clerk JWT issuer trusted by `auth.config.ts`
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway key for classification

## Working conventions

- Do not reintroduce the old notes-app domain (`notes` table, OpenAI summary action, `/notes`
  routes). The product domain is **items + spaces**.
- Never pass `userId` from the client into Convex public functions.
- Keep `returns:` validators accurate — Convex enforces them at runtime.
- Prefer `withIndex` / search indexes over `.filter()` on growing tables.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`packages/backend/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install` from `packages/backend`.

<!-- convex-ai-end -->
