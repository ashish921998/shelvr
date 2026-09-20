import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { recipientValidator } from "./model/notificationFields";
import {
  articleMediaValidator,
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  postMediaValidator,
  recipeValidator,
} from "./model/itemFields";
import {
  cancelSurveyOutcomeValidator,
  cancelSurveyReasonValidator,
} from "./model/cancelSurveyFields";
import {
  feedbackDeliveryStatusValidator,
  feedbackPlatformValidator,
  feedbackSurfaceValidator,
} from "./model/feedbackFields";

export default defineSchema({
  // Convex Auth session/account tables (users, authSessions, authAccounts,
  // authRefreshTokens, authVerificationCodes, authVerifiers, authRateLimits).
  // The `users` table is the source of truth for the signed-in user's identity.
  // Use `getAuthUserId(ctx)` (or the app's `requireUserId(ctx)` wrapper) when
  // deriving the stable users-table document ID; the raw auth subject can also
  // include a session suffix.
  ...authTables,

  legalConsents: defineTable({
    userId: v.id("users"),
    reviewedVersion: v.string(),
    acceptedVersion: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    refundSharing: v.boolean(),
    changedAt: v.number(),
    deleting: v.optional(v.boolean()),
    syncState: v.union(
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
    ),
    nextSyncAt: v.number(),
    attempts: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_syncState_and_nextSyncAt", ["syncState", "nextSyncAt"]),

  paymentAnalyticsReceipts: defineTable({ eventId: v.string() }).index(
    "by_event",
    ["eventId"],
  ),

  items: defineTable({
    userId: v.string(),
    // Stable automation identity for development fixtures. Product writes do
    // not accept this field; only the guarded fixture reset can populate it.
    fixtureKey: v.optional(v.string()),
    type: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    title: v.optional(v.string()),
    // "user" once the owner typed the title. Classification then leaves
    // `title` alone; absent means any title is the classifier's.
    titleSource: v.optional(v.literal("user")),
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
    // Structured recipe lifted from the page's schema.org markup, a linked
    // recipe page, or (captions and screenshots) the classifier. Optional so
    // pre-existing rows validate; absent = not a recipe.
    recipe: v.optional(recipeValidator),
    siteName: v.optional(v.string()),
    // Creator handle for social saves (e.g. "@nasa"). Set for TikTok and X links.
    author: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    media: v.optional(v.array(postMediaValidator)),
    // Images and videos inside `content`. Kept apart from `media`, which marks
    // a save as a social post.
    articleMedia: v.optional(v.array(articleMediaValidator)),
    note: v.optional(v.string()),
    // AI-proposed pressable actions. Optional so pre-existing rows validate
    // without a backfill. `kind` is the closed union from model/itemFields.
    intents: v.optional(v.array(intentValidator)),
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
        v.literal("unavailable"),
      ),
    ),
    // Why processing failed, so the client can say something true instead of
    // rendering an item that looks stuck forever. Only set with
    // `status: "failed"`; absent on pre-existing failed rows.
    failureReason: v.optional(failureReasonValidator),
    // "partial" = classified from the URL alone because the page body could not
    // be read (403/429/5xx/timeout). The item is usable and retryable.
    // "no_article" = page fetched successfully but has no readable article body.
    // Absent means fully enriched.
    enrichment: v.optional(enrichmentValidator),
    // Identity of the pipeline run that currently owns this item. Every flip
    // to `processing` mints a fresh id and passes it to the scheduled
    // processItem action; finalizeItem/failItem write only when the caller's
    // id still matches, so a superseded run (a retry issued while the old
    // action was still awaiting the model) can never overwrite the newer
    // result. Absent on rows written before run fencing existed.
    processingRunId: v.optional(v.string()),
    // When the current run started (ms epoch). The stale-processing sweeper
    // and reprocessItem treat a `processing` row older than
    // PROCESSING_STALE_MS as orphaned. Absent on pre-fencing rows, which fall
    // back to `_creationTime` (their only run is the one create scheduled).
    processingStartedAt: v.optional(v.number()),
    searchText: v.string(),
  })
    .index("by_user", ["userId"])
    // Photo quota: count an account's image items without scanning links/notes.
    .index("by_user_and_type", ["userId", "type"])
    // Bulk import skips links the user already saved. Link URLs are stored
    // normalized, so an exact lookup finds a save of any age.
    .index("by_user_and_url", ["userId", "url"])
    // Status-scoped reads for one user (e.g. the ready items a recommendation
    // pass samples) without over-reading and filtering in JS.
    .index("by_user_and_status", ["userId", "status"])
    // Stale-processing sweeper: pages `processing` rows across all users by
    // run start. `undefined` sorts before every number, so pre-fencing rows
    // with no processingStartedAt land at the front of the range and are
    // judged by `_creationTime` instead.
    .index("by_status_and_processingStartedAt", [
      "status",
      "processingStartedAt",
    ])
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
    fixtureKey: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    // Dynamic = Shelvr keeps suggesting new saves into this space. Absent means
    // false (legacy spaces stay quiet until edited).
    dynamic: v.optional(v.boolean()),
    // Denormalized membership summary so the spaces list never has to walk
    // `spaceItems`. Counts mirror the spaceItems status vocabulary: `saved`
    // rows (user-owned memberships) and `suggested` rows (pending AI picks);
    // `dismissed` rows are never counted. The preview lists hold up to
    // PREVIEW_LIMIT item ids per bucket, most recently added first. Every
    // spaceItems write goes through model/memberships.ts, which updates
    // these fields in the same transaction, so they can never drift from the
    // join rows. All four are absent on rows written before this existed;
    // `spaces:backfillSpaceCounters` fills them in, and listSpaces falls back
    // to a bounded scan until it has run.
    savedCount: v.optional(v.number()),
    suggestedCount: v.optional(v.number()),
    previewItemIds: v.optional(v.array(v.id("items"))),
    suggestedPreviewItemIds: v.optional(v.array(v.id("items"))),
  })
    .index("by_user", ["userId"])
    // Space names are the stable key used by onboarding replay. Keeping this
    // lookup index-backed makes retries idempotent without creating duplicates.
    .index("by_user_and_name", ["userId", "name"]),

  spaceItems: defineTable({
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
    // The membership state machine. The classifier and recommendation passes
    // may only create or remove `suggested` rows; `saved` and `dismissed` are
    // user-owned, so the pipeline can never clobber a user decision. Purpose
    // steering may fill `intents` on a `saved` row but never moves its status.
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
    // "interior design". Same shape as items.intents (model/itemFields).
    intents: v.optional(v.array(intentValidator)),
  })
    .index("by_space", ["spaceId"])
    // Preview refills read one status bucket at a time, so a pile of
    // dismissed rows can never hide the saved rows behind them.
    .index("by_space_and_status", ["spaceId", "status"])
    .index("by_item", ["itemId"])
    // The (item, space) pair is the membership key; every user decision and
    // steering write looks it up.
    .index("by_item_and_space", ["itemId", "spaceId"])
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

  // One next-visit cancel-survey ask per user (convex/cancelSurvey.ts). The
  // row is the durable, cross-install record: its existence is the ask, and
  // the first recorded outcome wins. Local (MMKV) state can never enforce
  // once-per-account across devices or reinstalls — only this row can.
  cancelSurveys: defineTable({
    userId: v.string(),
    askedAt: v.number(),
    outcome: v.optional(cancelSurveyOutcomeValidator),
    // Bounded reason id from the client survey (never free text). The client's
    // CancelSurveyReason derives from the same CANCEL_SURVEY_REASONS tuple this
    // validator is built from, so the two cannot disagree.
    reason: v.optional(cancelSurveyReasonValidator),
    respondedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // Authenticated in-app feedback (convex/feedback.ts). Convex is the source
  // of truth; the support-inbox email is only a projection, so a Resend
  // outage or missing operator configuration can never lose a submission.
  // The message never reaches PostHog — client telemetry carries surface,
  // char count, and a content-free delivery category only. Deleting a row
  // does not retract an already-delivered email (see
  // docs/architecture/feedback.md).
  feedbackSubmissions: defineTable({
    userId: v.string(),
    message: v.string(),
    surface: feedbackSurfaceValidator,
    // Bounded app context so the operator can reply with the right build in
    // mind. Platform is a closed union; the version strings are capped at
    // write time.
    platform: v.optional(feedbackPlatformValidator),
    appVersion: v.optional(v.string()),
    buildVariant: v.optional(v.string()),
    status: feedbackDeliveryStatusValidator,
    // Delivery attempts started, spent at claim time before the send so a
    // delivery that crashes mid-flight still counts toward the cap.
    // `unconfigured` claims are free, and a row that reaches the attempt
    // cap stays `failed` for manual inspection instead of occupying the
    // retry window forever.
    attempts: v.number(),
    // `<category>[:<http status>]` — why the last delivery failed, without
    // any provider text (which can echo the message back).
    deliveryError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    // Account deletion drains the user's rows through this index.
    .index("by_user", ["userId"])
    // Bounded, index-backed retry scan: each retryable status pages rows
    // below the attempt cap without ever scanning the whole table.
    .index("by_status_attempts", ["status", "attempts"]),

  // One Expo push token per device. A token row moves to a different account
  // only after its current owner disables it (the client revokes every stored
  // token before sign-out); an enabled row owned by someone else is never
  // re-bound, so knowing a token is not enough to take over its deliveries.
  // `by_user_and_enabled` lets delivery read only live devices without
  // scanning a user's disabled rows.
  notificationDevices: defineTable({
    userId: v.string(),
    locale: v.optional(v.string()),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    enabled: v.boolean(),
    lastSeenAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_enabled", ["userId", "enabled"])
    .index("by_token", ["token"]),

  // Delivery preferences and the next UTC instant at which the weekly shelf
  // should be prepared. The client calculates this in the user's timezone.
  notificationPreferences: defineTable({
    userId: v.string(),
    weeklyShelfEnabled: v.boolean(),
    nextDigestAt: v.number(),
    timezone: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_enabled_and_next_digest_at", [
      "weeklyShelfEnabled",
      "nextDigestAt",
    ]),

  // Read state is separate from items so opening a save does not rewrite the
  // item row that is rendered throughout the feed.
  itemReads: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    firstOpenedAt: v.number(),
    lastOpenedAt: v.number(),
  })
    .index("by_user_and_item", ["userId", "itemId"])
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  // A persisted weekly shelf keeps the notification payload and in-app view
  // stable even if the underlying saves are later deleted or reclassified.
  weeklyDigests: defineTable({
    userId: v.string(),
    weekStart: v.number(),
    itemIds: v.array(v.id("items")),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    openedAt: v.optional(v.number()),
    deliveryStatus: v.optional(
      v.union(v.literal("pending"), v.literal("complete"), v.literal("failed")),
    ),
    deliveryNextAttemptAt: v.optional(v.number()),
    deliveryAttempts: v.optional(v.number()),
    deliveryRecipients: v.optional(v.array(recipientValidator)),
    deliveryError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_week", ["userId", "weekStart"])
    .index("by_delivery_status_and_attempt", [
      "deliveryStatus",
      "deliveryNextAttemptAt",
    ]),

  // The pre-payment onboarding demo save. One row per user (the allowance is
  // server-enforced), pointing at the one real item the user saved during the
  // demo step. Written only by `createDemoItem`; the (empty-index read +
  // insert) pair relies on Convex's serializable OCC so two racing calls
  // cannot both mint an allowance.
  onboardingDemos: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    createdAt: v.number(),
    // Persistent retry cap (in addition to the time-bounded rate limiter) so a
    // permanently unclassifiable page cannot loop pipeline runs forever.
    retryCount: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  // Provider-independent waitlist source of truth. Resend is only a delivery
  // and preference-management projection of these records, so a provider
  // outage or migration can never lose the original signup or consent trail.
  waitlistSignups: defineTable({
    email: v.string(),
    product: v.union(v.literal("shelvr"), v.literal("shelvr-android")),
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
    resendAttempts: v.optional(v.number()),
  })
    .index("by_email_and_product", ["email", "product"])
    // Bounded Resend retry cron pages failed/pending/unconfigured rows below
    // the attempt cap without scanning the whole waitlist.
    .index("by_resendStatus_attempts", ["resendStatus", "resendAttempts"]),
});
