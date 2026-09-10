import type { StorageActionWriter } from "convex/server";
import type { Id } from "../_generated/dataModel";

// Base64 expands this to ~19.6 MB, leaving room for prompts below Gemini's
// 20 MB inline request limit. Check before allocating the file's byte buffer.
export const MAX_STORED_IMAGE_BYTES = 14 * 1024 * 1024;
export type StoredImageErrorCode = "not_found" | "empty" | "too_large";

export class StoredImageError extends Error {
  constructor(public readonly code: StoredImageErrorCode) {
    super(`stored image ${code}`);
    this.name = "StoredImageError";
  }
}

// Read directly from storage to avoid the SDK's dynamic undici loader.
// Preserve MIME metadata: byte sniffing misses some valid HEIC/HEIF headers.
export async function readStoredImage(
  storage: Pick<StorageActionWriter, "get">,
  storageId: Id<"_storage">,
): Promise<{ bytes: Uint8Array; mediaType: string | undefined }> {
  const blob = await storage.get(storageId);
  if (blob === null) throw new StoredImageError("not_found");
  if (blob.size === 0) throw new StoredImageError("empty");
  if (blob.size > MAX_STORED_IMAGE_BYTES)
    throw new StoredImageError("too_large");
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mediaType: blob.type || undefined,
  };
}
