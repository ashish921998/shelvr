import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { recipientValidator } from "./model/notificationFields";
import {
  articleMediaValidator,
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  placePinsValidator,
  placeLocationsValidator,
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
import {
  tripDayValidator,
  tripPaceValidator,
  tripSlotValidator,
  tripStopValidator,
} from "./model/trip";
import {
  tripInterestValidator,
  tripStayValidator,
  tripStopSourceValidator,
} from "./model/tripPlan";

export default defineSchema({
  ...authTables,

  users: defineTable({
    ...authTables.users.validator.fields,
    appleRefreshToken: v.optional(v.string()),
    deleting: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  appleTokens: defineTable({
    userId: v.id("users"),
    refreshToken: v.string(),
    clientId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  detachedAppleTokens: defineTable({
    refreshToken: v.string(),
    createdAt: v.number(),
  }),

  aiConsents: defineTable({
    userId: v.string(),
    status: v.union(v.literal("granted"), v.literal("declined")),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  legalConsents: defineTable({
    userId: v.id("users"),
    reviewedVersion: v.string(),
    acceptedVersion: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    refundSharing: v.boolean(),
    changedAt: v.number(),
    revision: v.optional(v.number()),
    deleting: v.optional(v.boolean()),
    syncState: v.union(
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("failed"),
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
    fixtureKey: v.optional(v.string()),
    type: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    title: v.optional(v.string()),
    titleSource: v.optional(v.literal("user")),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    aspectRatio: v.optional(v.number()),
    capturedAt: v.optional(v.number()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    placePins: v.optional(placePinsValidator),
    placesEdited: v.optional(v.boolean()),
    isSticker: v.optional(v.boolean()),
    tags: v.array(v.string()),
    content: v.optional(v.string()),
    recipe: v.optional(recipeValidator),
    siteName: v.optional(v.string()),
    author: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    media: v.optional(v.array(postMediaValidator)),
    articleMedia: v.optional(v.array(articleMediaValidator)),
    note: v.optional(v.string()),
    intents: v.optional(v.array(intentValidator)),
    cities: v.optional(v.array(v.string())),
    places: v.optional(v.array(v.string())),
    placeLocations: v.optional(placeLocationsValidator),
    /** True once a run has read the video's speech for places; a rerun then reads it no more. */
    placesHeard: v.optional(v.boolean()),
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
    productsSearchStartedAt: v.optional(v.number()),
    failureReason: v.optional(failureReasonValidator),
    enrichment: v.optional(enrichmentValidator),
    processingRunId: v.optional(v.string()),
    processingStartedAt: v.optional(v.number()),
    searchText: v.string(),
    // Retired: nothing reads it, and `items:clearEmbeddings` removes it. Stays declared
    // until no row carries it (one-way door).
    embedding: v.optional(v.array(v.float64())),
    embeddingVersion: v.optional(v.number()),
    embeddingAttempts: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_url", ["userId", "url"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_status_and_processingStartedAt", [
      "status",
      "processingStartedAt",
    ])
    .index("by_storage", ["storageId"])
    .index("by_status_and_embeddingVersion", ["status", "embeddingVersion"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId"],
    }),

  spaces: defineTable({
    userId: v.string(),
    fixtureKey: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    dynamic: v.optional(v.boolean()),
    autoFile: v.optional(v.boolean()),
    autoFileSince: v.optional(v.number()),
    savedCount: v.optional(v.number()),
    suggestedCount: v.optional(v.number()),
    previewItemIds: v.optional(v.array(v.id("items"))),
    suggestedPreviewItemIds: v.optional(v.array(v.id("items"))),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_name", ["userId", "name"]),

  spaceItems: defineTable({
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
    status: v.optional(
      v.union(
        v.literal("suggested"),
        v.literal("saved"),
        v.literal("dismissed"),
      ),
    ),
    intents: v.optional(v.array(intentValidator)),
  })
    .index("by_space", ["spaceId"])
    .index("by_space_and_status", ["spaceId", "status"])
    .index("by_item", ["itemId"])
    .index("by_item_and_space", ["itemId", "spaceId"])
    .index("by_user", ["userId"]),

  itemOperations: defineTable({
    userId: v.string(),
    operationId: v.string(),
    kind: v.union(v.literal("image"), v.literal("link"), v.literal("note")),
    status: v.union(v.literal("pending"), v.literal("complete")),
    storageId: v.optional(v.id("_storage")),
    itemId: v.optional(v.id("items")),
    uploadUrl: v.optional(v.string()),
    uploadUrlIssuedAt: v.optional(v.number()),
    uploadTokenHash: v.optional(v.string()),
    uploadClaimedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_operation", ["userId", "operationId"])
    .index("by_user_and_kind_and_status", ["userId", "kind", "status"])
    .index("by_upload_token_hash", ["uploadTokenHash"])
    .index("by_item", ["itemId"])
    .index("by_storage", ["storageId"])
    .index("by_kind_status_updated", ["kind", "status", "updatedAt"]),

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
    eventTimestampMs: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"]),

  cancelSurveys: defineTable({
    userId: v.string(),
    askedAt: v.number(),
    outcome: v.optional(cancelSurveyOutcomeValidator),
    reason: v.optional(cancelSurveyReasonValidator),
    respondedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  feedbackSubmissions: defineTable({
    userId: v.string(),
    message: v.string(),
    surface: feedbackSurfaceValidator,
    platform: v.optional(feedbackPlatformValidator),
    appVersion: v.optional(v.string()),
    buildVariant: v.optional(v.string()),
    status: feedbackDeliveryStatusValidator,
    attempts: v.number(),
    deliveryError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status_attempts", ["status", "attempts"]),

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

  notificationPreferences: defineTable({
    userId: v.string(),
    weeklyShelfEnabled: v.boolean(),
    nextDigestAt: v.number(),
    timezone: v.optional(v.string()),
    remindersEnabled: v.optional(v.boolean()),
    nextReminderAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_enabled_and_next_digest_at", [
      "weeklyShelfEnabled",
      "nextDigestAt",
    ])
    .index("by_next_reminder_at", ["nextReminderAt"]),

  itemReads: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    firstOpenedAt: v.number(),
    lastOpenedAt: v.number(),
  })
    .index("by_user_and_item", ["userId", "itemId"])
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  placeVisits: defineTable({
    userId: v.string(),
    key: v.string(),
    name: v.string(),
    itemId: v.id("items"),
    visitedAt: v.number(),
  })
    .index("by_user_and_key", ["userId", "key"])
    .index("by_user_and_visited", ["userId", "visitedAt"]),

  planShares: defineTable({
    token: v.string(),
    userId: v.string(),
    spaceId: v.id("spaces"),
    city: v.optional(v.string()),
    places: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        area: v.optional(v.string()),
        why: v.string(),
        itemId: v.id("items"),
      }),
    ),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_space", ["spaceId"])
    .index("by_user", ["userId"])
    .index("by_expires", ["expiresAt"]),

  planVotes: defineTable({
    shareId: v.id("planShares"),
    voterId: v.string(),
    picks: v.array(v.string()),
    passes: v.array(v.string()),
    revision: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_share_and_voter", ["shareId", "voterId"]),

  trips: defineTable({
    userId: v.string(),
    spaceId: v.id("spaces"),
    city: v.optional(v.string()),
    pace: tripPaceValidator,
    startDate: v.optional(v.string()),
    days: v.array(tripDayValidator),
    wishlist: v.array(tripStopValidator),
  })
    .index("by_user", ["userId"])
    .index("by_space", ["spaceId"]),

  tripPlans: defineTable({
    userId: v.string(),
    shareToken: v.optional(v.string()),
    name: v.optional(v.string()),
    city: v.string(),
    startDate: v.optional(v.string()),
    dayCount: v.number(),
    pace: tripPaceValidator,
    interests: v.array(tripInterestValidator),
    stay: v.optional(tripStayValidator),
    stopCount: v.number(),
    savedCount: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_share_token", ["shareToken"]),

  tripStops: defineTable({
    tripId: v.id("tripPlans"),
    userId: v.string(),
    day: v.number(),
    order: v.number(),
    source: tripStopSourceValidator,
    itemId: v.optional(v.id("items")),
    name: v.string(),
    area: v.optional(v.string()),
    lat: v.number(),
    lng: v.number(),
    appleId: v.optional(v.string()),
    category: v.optional(v.string()),
    why: v.optional(v.string()),
    slot: v.optional(tripSlotValidator),
  })
    .index("by_trip_and_day", ["tripId", "day", "order"])
    .index("by_user", ["userId"]),

  captureTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),

  shareLinks: defineTable({
    token: v.string(),
    userId: v.string(),
    itemId: v.id("items"),
    confirmedAt: v.optional(v.number()),
    pending: v.optional(v.boolean()),
  })
    .index("by_token", ["token"])
    .index("by_item", ["itemId"])
    .index("by_user", ["userId"]),

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
    deliverySentAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_week", ["userId", "weekStart"])
    .index("by_delivery_status_and_attempt", [
      "deliveryStatus",
      "deliveryNextAttemptAt",
    ]),

  saveReminders: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    kind: v.union(v.literal("read"), v.literal("cook")),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    deliveryStatus: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    deliveryNextAttemptAt: v.optional(v.number()),
    deliveryAttempts: v.optional(v.number()),
    deliveryRecipients: v.optional(v.array(recipientValidator)),
    deliveryError: v.optional(v.string()),
    deliverySentAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_item", ["userId", "itemId"])
    .index("by_delivery_status_and_attempt", [
      "deliveryStatus",
      "deliveryNextAttemptAt",
    ]),

  onboardingDemos: defineTable({
    userId: v.string(),
    itemId: v.id("items"),
    createdAt: v.number(),
    retryCount: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  waitlistSignups: defineTable({
    email: v.string(),
    product: v.union(v.literal("shelvr"), v.literal("shelvr-android")),
    source: v.union(
      v.literal("hero"),
      v.literal("preview"),
      v.literal("footer"),
      v.literal("plan"),
      v.literal("unknown"),
    ),
    consentVersion: v.string(),
    consentText: v.string(),
    consentedAt: v.number(),
    confirmedAt: v.optional(v.number()),
    confirmed: v.optional(v.boolean()),
    confirmationHash: v.optional(v.string()),
    confirmationExpiresAt: v.optional(v.number()),
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
    .index("by_confirmationHash", ["confirmationHash"])
    .index("by_confirmed_and_resendStatus_and_resendAttempts", [
      "confirmed",
      "resendStatus",
      "resendAttempts",
    ])
    .index("by_resendStatus_attempts", ["resendStatus", "resendAttempts"]),
});
