# Embeddings and semantic retrieval

Status: **Phases 0-2 implemented.** Phases 3-4 remain proposed.

## Why

Three shipped features are capped by the amount of the shelf they can see, and the
caps tighten exactly as a shelf becomes worth having:

| Feature                     | Today                                                             | Cap                                                                |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ai.ts` `recommendForSpace` | newest 100 `ready` items (`listReadyItemsInternal`, `limit: 100`) | a user with 600 saves gets picks drawn from 100                    |
| `items.ts` `similarItems`   | newest 300 rows, tag + token overlap                              | `SIMILAR_CANDIDATES = 300`                                         |
| `items.ts` `searchItems`    | `search_text` index over `buildSearchText`                        | title + description + tags + siteName + note — **never `content`** |

`finalizeItem` stores the extracted article body (`content`, up to 100k chars) and
then indexes only the classifier's summary of it. A saved essay is searchable by
its ~40-word description, not by anything it says.

All three sit on the retrieval side of the useful-returns metric
(`docs/analytics/README.md`). Capture is already frictionless; retrieval is the
bound.

## Decision

Store one embedding per item in Convex, indexed by a native `vectorIndex`. No
external vector store — see "Rejected alternatives".

Retrieval becomes two complementary signals:

- **vector** — topical recall. "that thing about why you shouldn't sear meat first"
  has zero keyword overlap with its title.
- **lexical** — literal phrase recall, once `content` is actually indexed.

They fail in different directions, so hybrid search fuses both rather than
replacing one with the other.

## Phase 0 — index the article body (implemented)

`buildSearchText` (`items.ts:224`) gains a bounded slice of `content`:

```ts
const MAX_SEARCH_CONTENT_CHARS = 8000; // mirrors MAX_SEARCH_NOTE_CHARS
```

Both `buildSearchText` call sites (`items.ts:1504`, `items.ts:1783`) pass it.
No schema change, no client change, no new dependency. Existing rows pick it up
on their next classification; a backfill is optional (Phase 1's sweeper can
rewrite `searchText` in the same pass).

This is not redundant with embeddings. It is the half that makes exact phrases
findable.

**It also required fixing `similarItems`.** That scorer tokenized
`item.searchText`, and `searchTokens` keeps every token longer than three
characters with no stopword list. Once the body was in `searchText`, any two
English articles shared "that", "with", "from", "have" and dozens more, clearing
`SIMILAR_MIN_SCORE = 3` on filler alone — every candidate would qualify and
ranking would track document length instead of topic. `similarItems` now scores
on a `summaryText()` helper that rebuilds exactly the pre-Phase-0 value
(title + description + tags + siteName + note). The full-text index gets the
body; the scorer deliberately does not.

Known cost, accepted: `searchText` rides along on `enrichedItemValidator`, so
public reads ship up to ~8 KB more per row. Those reads already carry `content`
(up to 100k), so this is roughly an 8% increase on an existing problem rather
than a new one. Phase 3 retires it by returning cards from an action.

## Phase 1 — write embeddings (implemented, backend only)

### Schema (`schema.ts`)

```ts
items: defineTable({
  // ...existing fields
  // Semantic index vector. Optional: rows written before this existed carry
  // none and are simply absent from the vector index until the backfill runs.
  embedding: v.optional(v.array(v.float64())),
  // Which generation produced `embedding`. Bumped when the model or the
  // composed text changes, so the sweeper can find stale rows. `undefined`
  // sorts before every number, so a `lt(CURRENT)` range covers never-embedded
  // and out-of-date rows in one scan (same trick as
  // `by_status_and_processingStartedAt`).
  embeddingVersion: v.optional(v.number()),
})
  // Backfill/refresh sweeper: `ready` rows below the current generation.
  .index("by_status_and_embeddingVersion", ["status", "embeddingVersion"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: EMBEDDING_DIMENSIONS,
    filterFields: ["userId"],
  }),
```

`filterFields` is **`userId` only**, deliberately. Convex vector filters support
equality and `q.or(...)` but no AND across fields, so adding `status` would
force a choice between them. `userId` is the one that must never be wrong;
`status === "ready"` is applied after hydration.

### The field must not reach the client

`itemFields` (`items.ts:100`) is spread into `enrichedItemValidator`, which is
the `returns:` validator of `searchItems`, `getItem`, and the legacy
`listItems`. A 768-float array is ~6 KB. Shipping it with every feed row is
precisely the cost the card/detail split was built to avoid (`items.ts:176-183`).

Therefore:

- The fields are in the **schema only**, not in `itemFields`.
- As built, the strip happens in **`enrichItem`**, not `toItemCard`. `enrichItem`
  is the single chokepoint all five client-facing reads share (`listItems`,
  `listItemsPage` via `toItemCard`, `getItem`, `searchItems`, the weekly digest,
  and `getSpace`), so one `stripEmbedding` call covers them all instead of five
  separate edits.
- The two internal queries that return **raw documents** under
  `v.object(itemFields)` — `getItemInternal` and `listReadyItemsInternal` — do
  not pass through `enrichItem`, so they strip explicitly. Without this they
  would fail their own return validators at runtime, and
  `listReadyItemsInternal` would drag 100 vectors into the action on every
  recommendation pass.

### Composing the embedded text

New helper beside `buildSearchText`:

```ts
const MAX_EMBED_CHARS = 6000; // ~1.5k tokens, under the model's input limit

function buildEmbeddingText(parts: {
  title?: string;
  description?: string;
  tags: string[];
  siteName?: string;
  note?: string;
  content?: string;
}): string;
```

Title, description, tags, then the lede of `content` or `note`. Intents stay out,
for the reason already documented at `items.ts:1774` — they are actions, not
descriptive text.

### Where the call goes

In `processItem` (`ai.ts`), after `generateObject`, before `finalizeItem`.
`embedding` becomes a new optional arg on `finalizeItem` (`items.ts:1733`) so it
lands in the **same run-fenced transaction** as the rest of the classification.
A separate mutation could commit after a superseding run and defeat `ownsRun`.

Follows the file's existing deadline convention:

```ts
const EMBED_TIMEOUT_MS = 20_000;
```

The per-action budget comment (`ai.ts:53-59`) gains one line; ~100 s worst case
is unchanged in practice.

**Embedding failure must never fail the item.** Wrap the call; on error log via
`logEvent` and call `finalizeItem` without `embedding`. The item goes `ready`
and the sweeper picks it up. Degradable by construction.

`finalizeItem` re-validates the vector before writing even though the action
already did. Convex rejects a wrong-width vector at write time, and that would
fail the whole classification transaction — losing the classification over a
field that is optional by design.

`updateNoteItem` clears `embeddingVersion`. A note's own words are most of what
it is embedded from; a text edit already schedules a re-classify that re-embeds,
but a title-only edit does not, so clearing the stamp covers both by handing the
row back to the sweep.

### Model

Google, through the `@ai-sdk/google` provider and the existing
`GOOGLE_GENERATIVE_AI_API_KEY`. **No new env var, no change to
`convex.config.ts`, no new vendor in the save path.**

Use Matryoshka truncation to 768 dimensions: a quarter the storage of 3072 at
negligible quality cost for per-user corpora this size.

Resolved at implementation: the model is **`gemini-embedding-2`**, confirmed
present in the installed `@ai-sdk/google@4.0.39` type union rather than from
memory. The non-deprecated factory in v4 is `google.embedding(id)`, and the
width is requested as `providerOptions.google.outputDimensionality` — a
top-level sibling of `model` and `values` on `embedMany`, keyed by provider
name. Nested anywhere else it is silently ignored and the call returns 3072-dim
vectors, which Convex would then reject at write time.

**Stored vectors are normalized regardless.** `gemini-embedding-2` is documented
to L2-normalize its own truncated output, but its sibling `gemini-embedding-001`
explicitly does not at any width other than 3072. Cosine scoring is only
meaningful for unit-length vectors, and nothing downstream fails loudly if
normalization silently stops, so `normalizeEmbedding` runs on every vector. On
an already-unit vector it is a numerical no-op.

`embedMany` splits at the provider's documented 100-values ceiling on its own,
so the sweep hands it a whole page and does no chunking itself.

### Backfill

`internalAction` mirroring `backfillImageAspectRatios` (`ai.ts:1422`), paged by
the new index, batching through `embedMany`:

- a page of `ready` rows with `embeddingVersion < CURRENT_EMBEDDING_VERSION`
- one `embedMany` per page
- one bounded mutation to write them back
- a page that embedded something chains itself, like `failStaleProcessingItems`

**The page is bounded by bytes as well as rows.** A `ready` link can carry 100k
characters of `content`, so rows alone is not a bound: a page of long articles
would blow the transaction read limit, and because the same rows lead the range
every run, the sweep would wedge on them permanently rather than failing once.
The query streams rows and stops at `EMBEDDING_SWEEP_PAGE` or
`MAX_SWEEP_READ_BYTES`, whichever comes first.

**Stamping is what removes a row from the range, so it is never done on a
failure the item did not cause.** This was the most serious defect review
caught. The write-back takes an explicit outcome per item:

| Outcome            | Meaning                                               | Effect                                                   |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| `embedded`         | usable vector                                         | write, stamp, clear attempts                             |
| `nothing_to_embed` | no embeddable text at all                             | stamp — it is finished either way                        |
| `failed`           | provider answered for the batch but not for this item | spend an attempt; stamp only at `MAX_EMBEDDING_ATTEMPTS` |
| `deferred`         | whole batch came back empty — provider is down        | change nothing; retry on a later tick                    |

The action tells `failed` from `deferred` by whether the batch produced anything
at all. Without that distinction, a provider outage would march the entire
table, stamp every item as done with no vector, and — because chaining was
gated on rows touched — do it at full speed. Nothing would ever revisit those
rows. Chaining is now gated on vectors actually written, so an outage does not
accelerate.

The attempt cap exists so one permanently unembeddable item cannot sit at the
front of the range blocking everything behind it. A version bump re-enlists
anything given up on.

**A staleness fence guards the write.** The version guard catches a pipeline run
that embedded successfully, but not one that re-classified an item and then
failed to embed — that clears the stamp, so the row looks unembedded while its
text is newer than what the action read. The write-back echoes back the text it
embedded and skips the row when the composed text no longer matches.

`searchText` is rewritten only when the value actually changes, so a drained
sweep does not invalidate every subscribed feed query on a timer.

Driven by a cron in `crons.ts` that idles at zero cost once drained, so it
doubles as the repair path for items whose inline embed failed and as the
migration path when `CURRENT_EMBEDDING_VERSION` is bumped.

Watch the provider's embedding rate limit; the page size is the throttle.

## Phase 2 — recommendations get the whole shelf (implemented, backend only)

The highest-value change, and it needed **no client release**.

`recommendForSpace` replaced its "newest 100" read with
`recommendationCandidates()` in `ai.ts`:

1. Embed `space.name` + `space.description`, composed through
   `buildEmbeddingText` so the query sits where the corpus summaries sit, and
   sent with `taskType: "RETRIEVAL_QUERY"` — the stored vectors are
   `RETRIEVAL_DOCUMENT`, and Gemini retrieval is asymmetric. `embedTexts` and
   `embedQuery` are now thin wrappers over one `embedBatch`, so the pairing is
   picked by choosing a function rather than by passing a string.
2. `ctx.vectorSearch("items", "by_embedding", { vector, limit: 150, filter: q => q.eq("userId", space.userId) })`
3. Drop existing members from the hit ids, then hydrate the rest through
   `items.listReadyItemsByIdInternal`, which preserves the ranking order, drops
   non-`ready` rows, re-checks the owner, strips vectors, and takes 100.
4. Hand to the **same** `generateObject` prompt, unchanged.

Same model, same token cost, same output contract, same `suggested`-only write
rule. The only difference is that the 100 candidates are the 100 most relevant
instead of the 100 most recent.

Two bounds worth naming. The search asks for 150 to leave headroom for the
members and stale-status rows that step 3 removes, so a space whose strongest
matches are already filed does not arrive at the prompt short-handed. And
hydration stops at a 2 MB read budget as well as at 100 rows, because one
`ready` link can carry 100k characters of extracted article; truncating is safe
here only because the ids arrive in descending relevance order, so the budget
drops the least relevant tail.

**Fallback is mandatory**, and is implemented. If the query cannot be embedded,
or the search returns nothing, or nothing survives hydration — backfill still
running, a user whose items all failed to embed, a provider outage — the action
falls through to the original `listReadyItemsInternal` path. Without it the
feature would regress from "newest 100" to nothing for every pre-backfill user.
Which path ran is logged as `recommend_candidates` with `source: vector | recent`,
so the rollout is observable without touching user content.

`listReadyItemsByIdInternal` exists because `ctx.vectorSearch` returns only
`{_id, _score}` and is action-only: the ids have to come back through a query
to become rows. The status drop in that query is not belt-and-braces — the
vector index carries `userId` as its sole filter field (Convex vector filters
cannot AND across fields), so a vector that outlived its item's flip to
`failed` will still match.

## Phase 3 — hybrid search (expand/contract)

> **Carried obligation from Phase 1.** Stored item vectors are embedded with
> `taskType: "RETRIEVAL_DOCUMENT"`. Gemini embeddings are asymmetric, so the
> query side of any search MUST use `RETRIEVAL_QUERY`. Mixing the two degrades
> ranking silently rather than failing, so it will not surface in tests.

`searchItems` is a public query and therefore a contract with every build in the
wild, and `ctx.vectorSearch` is action-only. Per the CLAUDE.md expand/contract
rule, `searchItems` is **not modified**.

Add a new public action:

```ts
export const searchItemsHybrid = action({
  args: { query: v.string() },
  returns: v.array(enrichedItemValidator), // same shape as searchItems
  ...
});
```

Flow, kept to one query round trip per the guidelines' "as few calls as possible":

1. `requireUserId(ctx)` — already accepts `ActionCtx` (`model/auth.ts:22`).
   The vector filter uses that id. Never a client argument.
2. Embed the query string.
3. `ctx.vectorSearch(..., filter: q => q.eq("userId", userId))` → `{_id, _score}`.
4. One `internalQuery` that runs the lexical `search_text` search, fuses it with
   the vector ids by reciprocal rank fusion (`1/(k + rank)`, k = 60), drops
   non-`ready` rows, hydrates through `enrichItem`, and returns in fused order.

Client: the search tab (`(tabs)/(search)/index.tsx:36`) moves from
`convexQuery(api.items.searchItems)` to the action. This is the one real
ergonomic cost of staying native — results stop being reactive. The screen
already debounces at 250 ms, so the user-visible change is small, but it is a
data-path rewrite, not a one-line swap.

Contract `searchItems` only once the production update channel shows no bundle
still calling it.

## Phase 4 — later, once the above is live

- **`similarItems`** — same query-vs-action problem; add `similarItemsHybrid` as
  an action and migrate. Sequenced last because it runs on every item-detail
  open, so it trades reactive caching for a per-open action call. Measure before
  committing.
- **Ask your shelf** — retrieval is already built by Phase 3; this is a prompt, a
  citation UI, and a Pro gate.
- **Chunked bodies** — one vector per item gives topical matching, not
  sentence-level recall inside long articles. If that turns out to matter, it
  needs an `itemChunks` table (Convex indexes one vector per document), which is
  a real schema addition rather than an extension of this one. Phase 0 covers
  literal-phrase recall in the meantime.

## Rejected alternatives

**turbopuffer (or any external vector store).** Queries here are always scoped to
one `userId`, so the natural layout is one namespace per user: thousands of tiny
namespaces, each touched every few days. That makes effectively every search a
cold object-storage read — paying turbopuffer's central tradeoff while a power
user's shelf (~10⁴ items) is far below the scale where its cost advantage
appears. It would also put an external system in two paths that must not have
partial-failure modes: `deleteItem` (`items.ts:1625`) is one transaction today,
and `deleteUserOwnedDataBatch` (`users.ts:91`) is the GDPR path. Both would need
tombstones and retry ledgers. Revisit if per-user corpora approach 10⁵, if
hand-rolled RRF becomes limiting, or — most likely first — if shared/public
spaces ship and break the one-namespace-per-user model.

**Brute-force cosine in an action.** Reading every embedding for a user costs
~6 KB × N of action bandwidth per search. Worse than the native index at every
size that matters.

**Keeping the embedding as the only source of truth in an index.** The vector
lives on the item row so any future migration is a re-index, not a re-embed.

## Deploy order

Backend deploys before the client that needs it (CLAUDE.md; `.github/workflows/deploy.yml`).

1. Phase 0 — backend only.
2. Phase 1 schema + write path + backfill cron — backend only, old clients unaffected.
3. Wait for the backfill to drain.
4. Phase 2 — backend only. **Value lands here with no app release.**
   Phases 0-2 ship in one deploy: the mandatory fallback makes step 3 a ramp
   rather than a gate, so recommendations stay exactly as good as they are
   today while the sweep drains and improve user by user as vectors land.
5. Phase 3 action — backend only (additive).
6. Client update pointing search at the action.
7. Contract `searchItems` once no old bundle calls it.

## Testing

Harnesses go through `newConvexTest()` (`convex/test.setup.ts`), never bare
`convexTest`. Stub the embedding provider the way `ai.test.ts` stubs the model.

- `toItemCard` / card validators reject a row carrying `embedding` — the
  regression that would ship 6 KB per feed row.
- `finalizeItem` writes `embedding` under a matching `runId` and returns
  `stale_run` under a superseded one.
- Embedding failure still produces a `ready` item with no `embedding`.
- `recommendForSpace` ranks by relevance rather than recency, embeds its query
  as `RETRIEVAL_QUERY`, drops members and rows whose vector outlived their
  `ready` status, and falls back to the recency path on an unembeddable query,
  an empty search, or a search that throws — still writing `suggested` rows only
  (`aiRecommendForSpace.test.ts`).
- `listReadyItemsByIdInternal` preserves the caller's ranking order, strips
  vectors, and stops at both the row limit and the byte budget
  (`itemEmbeddings.test.ts`).
- Hybrid search never returns another user's item (filter derived from
  `requireUserId`, not an argument).
- Backfill is bounded per run and chains while progress is made.

Known limitation: `aiEmbedding.test.ts` asserts the provider-option nesting
against the same literals the production code uses, so it cannot catch a wrong
call shape — a unit test has no way to. That nesting was instead verified
against the installed `@ai-sdk/google` dist, and is worth re-checking on a
provider upgrade.

Confirmed while writing Phase 2: `convex-test@0.0.54` **does** implement
`ctx.vectorSearch` (exact brute-force cosine, honoring the filter callback and
`limit`), so no stub seam is needed. Four divergences from production matter:
it throws rather than skipping when a matched document has no vector
field, it returns everything when `limit` is omitted, it does not enforce
`filterFields`, and it does not validate vector width. So assert on set
membership rather than exact scores, always pass an explicit `limit`, and give
every fixture row a vector. The first divergence turned out to be useful: it is
the only reachable way to make `ctx.vectorSearch` throw under test, which is how
the search-failure fallback is covered.

## Costs

- ~6 KB per item at 768 dims, plus the index.
- One extra provider call per save (sub-second) and one per search/recommendation.
- Backfill is a one-time embed of every existing `ready` item, throttled by page size.
