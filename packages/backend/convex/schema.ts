import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const itemType = v.union(
  v.literal("link"),
  v.literal("image"),
  v.literal("note"),
);

const itemStatus = v.union(
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
);

export default defineSchema({
  items: defineTable({
    userId: v.string(),
    type: itemType,
    status: itemStatus,
    // User-provided source material
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    // AI / extraction output
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    extractedText: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageAspectRatio: v.optional(v.number()),
    error: v.optional(v.string()),
    // Concatenated searchable text (title + description + tags + body)
    searchText: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId"],
    }),

  spaces: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  spaceItems: defineTable({
    userId: v.string(),
    spaceId: v.id("spaces"),
    itemId: v.id("items"),
  })
    .index("by_space", ["spaceId"])
    .index("by_item", ["itemId"])
    .index("by_user_and_space", ["userId", "spaceId"])
    .index("by_user_and_item", ["userId", "itemId"])
    .index("by_space_and_item", ["spaceId", "itemId"]),
});
