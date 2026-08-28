import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  enrichmentValidator,
  failureReasonValidator,
} from "./model/itemFields";

export default defineSchema({
  // Convex Auth session/account tables (users, authSessions, authAccounts,
  // authRefreshTokens, authVerificationCodes, authVerifiers, authRateLimits).
  // The `users` table is the source of truth for the signed-in user's identity.
  // Use `getAuthUserId(ctx)` (or the app's `requireUserId(ctx)` wrapper) when
  // deriving the stable users-table document ID; the raw auth subject can also
  // include a session suffix.
  ...authTables,

  items: defineTable({
    userId: v.string(),
    type: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    aspectRatio: v.optional(v.number()),
    capturedAt: v.optional(v.number()),
    // Where the photo was taken (signed decimal degrees, from EXIF GPS on
    // import). Always set together; absent for images without location data.
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isSticker: v.optional(v.boolean()),
    tags: v.array(v.string()),
    content: v.optional(v.string()),
    siteName: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    note: v.optional(v.string()),
    // AI-proposed pressable actions. Optional so pre-existing rows validate
    // without a backfill. `kind` is a closed union (mirrors items.ts).
    intents: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("open_url"),
            v.literal("copy"),
            v.literal("web_search"),
            v.literal("open_maps"),
            v.literal("call"),
            v.literal("email"),
            v.literal("message"),
            v.literal("add_event"),
          ),
          label: v.string(),
          value: v.string(),
        }),
      ),
    ),
    // Real product results from the user-triggered "Find links" pass
    // (SerpAPI Google Shopping). `productsStatus` tracks the in-flight action
    // so the button can show progress; absent = never searched.
    products: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          price: v.optional(v.string()),
          merchant: v.optional(v.string()),
          thumbnailUrl: v.optional(v.string()),
        }),
      ),
    ),
    productsStatus: v.optional(
      v.union(
        v.literal("searching"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    ),
    // Why processing failed, so the client can say something true instead of
    // rendering an item that looks stuck forever. Only set with
    // `status: "failed"`; absent on pre-existing failed rows.
    failureReason: v.optional(failureReasonValidator),
    // "partial" = classified from the URL alone because the page body could not
    // be read (403/429/5xx/timeout). The item is usable and retryable; absent
    // means fully enriched.
    enrichment: v.optional(enrichmentValidator),
    searchText: v.string(),
  })
    .index("by_user", ["userId"])
    // Lets attachImageUpload confirm a client-supplied storage id is not
    // referenced by any completed item before deleting/adopting it, so a
    // malicious caller can't point attach at another user's storage object.
    .index("by_storage", ["storageId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId"],
    }),

  spaces: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Dynamic = Shelvr keeps suggesting new saves into this space. Absent means
    // false (legacy spaces stay quiet until edited).
    dynamic: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    // Space names are the stable key used by onboarding replay. Keeping this
    // lookup index-backed makes retries idempotent without creating duplicates.
    .index("by_user_and_name", ["userId", "name"]),

  spaceItems: defineTable({
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
    // The membership state machine. The AI may only ever write `suggested`
    // rows and only ever touch `suggested` rows; `saved` and `dismissed` are
    // user-owned, so the pipeline can never clobber a user decision.
    // Absent = legacy row = "saved".
    status: v.optional(
      v.union(
        v.literal("suggested"),
        v.literal("saved"),
        v.literal("dismissed"),
      ),
    ),
    // Purpose-steered actions scoped to THIS space's membership: the same
    // couch gets a shopping link in "apartment shopping" and nothing extra in
    // "interior design". Mirrors items.intents; kinds kept in sync with items.ts.
    intents: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("open_url"),
            v.literal("copy"),
            v.literal("web_search"),
            v.literal("open_maps"),
            v.literal("call"),
            v.literal("email"),
            v.literal("message"),
            v.literal("add_event"),
          ),
          label: v.string(),
          value: v.string(),
        }),
      ),
    ),
  })
    .index("by_space", ["spaceId"])
    .index("by_item", ["itemId"])
    .index("by_user", ["userId"]),

  // Generic per-import idempotency ledger. One row per (userId, operationId),
  // where operationId is an opaque client-generated UUID. Plans 004/005 reuse
  // this table for link/note share and Tidy durability, so `kind` is closed
  // and kind-checked on every lookup; an operation ID reused with a different
  // kind is rejected rather than silently repurposed. The lifecycle is:
  //
  //   begin (pending) -> upload bytes -> attach storageId -> finalize (complete)
  //
  // `complete` rows are the permanent idempotency record — a retry reads the
  // same itemId back. `pending` rows older than 24h whose attached upload was
  // never finalized are swept by a bounded cleanup cron; their storage object
  // is deleted first. A completed row whose item was explicitly deleted is
  // recycled back to pending by beginImageImport, so a reissued durable
  // operationId performs a fresh save instead of returning a dead itemId.
  itemOperations: defineTable({
    userId: v.string(),
    operationId: v.string(),
    kind: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    status: v.union(v.literal("pending"), v.literal("complete")),
    storageId: v.optional(v.id("_storage")),
    itemId: v.optional(v.id("items")),
    updatedAt: v.number(),
  })
    // The logical unique key — every mutation loads the row through this index.
    .index("by_user_operation", ["userId", "operationId"])
    // deleteItem cleanup: releases ledger rows whose item was deleted so the
    // same durable operationId can be re-performed. Pending rows have no
    // itemId and so are never returned by this index lookup.
    .index("by_item", ["itemId"])
    // Lets isStorageUnreferenced see storage held by pending operations (an
    // uploaded-but-unfinalized blob), not just storage referenced by items —
    // otherwise the same blob could be adopted into two operations and later
    // deleted out from under a live item.
    .index("by_storage", ["storageId"])
    // Stale-pending cleanup cron, bounded per run. kind leads so the sweep
    // pages through image rows only and can't be starved by stale link/note
    // rows once plans 004/005 create them.
    .index("by_kind_status_updated", ["kind", "status", "updatedAt"]),

  // Pro subscription / entitlement state. One row per user, keyed by the Convex
  // Auth user id (the same userId every other table uses). Written exclusively by
  // the RevenueCat webhook (http.ts -> upsertSubscription); read by
  // getEntitlement (client) and requireProEntitlement (gated mutations). The
  // lifecycle is:
  //
  //   trialing (7-day yearly trial) -> pro (paid) -> lapsed (trial/sub ended)
  //
  // A lapsed user is read-only: they can view and search existing saves and
  // spaces, but every save and Pro feature is gated behind an active trial or
  // subscription. `expiresAt` is the end of the current period/trial (ms epoch);
  // the server re-checks it against Date.now() inside mutations (queries never
  // read the wall clock), and the client computes `entitled` from its own clock.
  subscriptions: defineTable({
    userId: v.string(),
    status: v.union(
      v.literal("trialing"),
      v.literal("pro"),
      v.literal("lapsed"),
      v.literal("lifetime"),
    ),
    expiresAt: v.number(),
    productId: v.optional(v.string()),
    // RevenueCat `event_timestamp_ms` — a monotonic event timestamp from the
    // webhook payload. Used to order events so a newer event can move expiry in
    // either direction (e.g. a refund shortens the period). Optional for
    // backward compatibility with rows created before this field existed.
    eventTimestampMs: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Provider-independent waitlist source of truth. Resend is only a delivery
  // and preference-management projection of these records, so a provider
  // outage or migration can never lose the original signup or consent trail.
  waitlistSignups: defineTable({
    email: v.string(),
    product: v.literal("shelvr"),
    source: v.union(
      v.literal("hero"),
      v.literal("preview"),
      v.literal("footer"),
      v.literal("unknown"),
    ),
    consentVersion: v.string(),
    consentText: v.string(),
    consentedAt: v.number(),
    firstSubmittedAt: v.number(),
    lastSubmittedAt: v.number(),
    resendStatus: v.union(
      v.literal("pending"),
      v.literal("synced"),
      v.literal("failed"),
      v.literal("unconfigured"),
    ),
    resendContactId: v.optional(v.string()),
    resendError: v.optional(v.string()),
    resendAttempts: v.number(),
  })
    .index("by_email_and_product", ["email", "product"])
    // Bounded Resend retry cron pages failed/pending/unconfigured rows below
    // the attempt cap without scanning the whole waitlist.
    .index("by_resendStatus_attempts", ["resendStatus", "resendAttempts"]),
});
