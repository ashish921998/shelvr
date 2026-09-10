import type { Id } from "../_generated/dataModel";

// Avoid the AI SDK's dynamic undici loader in Convex's bundled Node runtime.
// The SDK still detects the image format from these original file bytes.

/** Stable, data-free categories for the failure modes callers log. */
export type StoredImageErrorCode = "not_found" | "empty";

export class StoredImageError extends Error {
  constructor(public readonly code: StoredImageErrorCode) {
    super(
      code === "not_found"
        ? "stored image not found in storage"
        : "stored image is empty",
    );
    this.name = "StoredImageError";
  }
}

/** Minimal slice of the action's `ctx.storage` (Convex StorageActionWriter). */
export interface StoredImageStorage {
  get: (storageId: Id<"_storage">) => Promise<Blob | null>;
}

/**
 * Fetch the stored file and return its bytes. Throws StoredImageError when the
 * file is missing/deleted or holds no data; storage failures propagate
 * untouched. This helper does not change upload size or format eligibility.
 */
export async function readStoredImageBytes(
  storage: StoredImageStorage,
  storageId: Id<"_storage">,
): Promise<Uint8Array> {
  const blob = await storage.get(storageId);
  if (blob === null) {
    throw new StoredImageError("not_found");
  }
  if (blob.size === 0) {
    throw new StoredImageError("empty");
  }
  return new Uint8Array(await blob.arrayBuffer());
}
