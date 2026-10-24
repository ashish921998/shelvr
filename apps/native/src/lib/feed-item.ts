import type {
  enrichmentValidator,
  failureReasonValidator,
  intentValidator,
  PostMedia,
} from "@convex/model/itemFields";
import type { Infer } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";

/** The fields a save row carries for the widget. */
export type FeedItem = {
  _id: Id<"items">;
  _creationTime?: number;
  fixtureKey?: string;
  type: "image" | "link" | "note";
  status: "processing" | "ready" | "failed";
  title?: string;
  description?: string;
  url?: string;
  siteName?: string;
  author?: string;
  note?: string;
  imageUrl?: string | null;
  heroImageUrl?: string;
  aspectRatio?: number;
  media?: PostMedia[];
  isSticker?: boolean;
  failureReason?: Infer<typeof failureReasonValidator>;
  enrichment?: Infer<typeof enrichmentValidator>;
  intents?: Infer<typeof intentValidator>[];
  tags: string[];
  suggested?: boolean;
};
