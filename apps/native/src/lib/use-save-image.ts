import {
  IMAGE_TOO_LARGE_MESSAGE,
  imageSizeError,
  PHOTO_LIMIT_MESSAGE,
} from "@convex/model/imagePolicy";
import { saveErrorCode, type SaveErrorCode } from "@convex/model/saveErrors";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useCallback } from "react";
import { analytics, type ImageSaveFailureReason } from "@/lib/analytics";
import { normalizeImage } from "@/lib/normalize-image";
import { userSafeMessage } from "@/lib/user-safe-message";

export type LocalImage = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  /** Marks a subject-lifted die-cut PNG so the feed renders it as a sticker. */
  isSticker?: boolean;
  /** Original camera-roll capture time (epoch ms), read from EXIF on import. */
  capturedAt?: number;
  /** Where the photo was taken (signed decimal degrees), read from EXIF or
   * the media library on import. Set both or neither. */
  latitude?: number;
  longitude?: number;
};

/** One image plus its stable operation id. The id is a client-generated UUID
 * (optionally prefixed) that travels with the image across retries so a
 * re-submission reuses the same server operation instead of creating a new
 * item. `LocalImage` stays a description of the file; mutable status lives in
 * the operation ledger on the backend. */
export type ImageSaveRequest = {
  image: LocalImage;
  /** Reused on retry; auto-generated when absent (first attempt). */
  operationId?: string;
};

export type ImageSaveStage =
  | "begin"
  | "normalize"
  | "upload"
  | "attach"
  | "finalize";

/** A settled per-image outcome. A failure is data, not a rejected promise, so
 * one image failing can never erase its siblings' success information. A caller
 * retries only `failed` results, passing their existing operationId back. */
export type ImageSaveResult =
  | {
      status: "saved";
      operationId: string;
      image: LocalImage;
      itemId: Id<"items">;
    }
  | {
      status: "failed";
      operationId: string;
      image: LocalImage;
      stage: ImageSaveStage;
      message: string;
      /** Set when the server refused with a structured code. Absent for a
       * client-side failure and for a server that still throws bare sentences,
       * which `saveFailureReason` then buckets by message. */
      code?: SaveErrorCode;
    };

/** The four backend ops the orchestration drives. Kept as a dependency object
 * so the orchestration is unit-testable with fakes and so `useSaveImages` can
 * bind it to the Convex `useMutation` hooks. */
export type SaveImageDeps = {
  begin: (
    operationId: string,
  ) => Promise<
    | { kind: "upload"; uploadUrl: string }
    | { kind: "complete"; itemId: Id<"items"> }
  >;
  /** Re-encodes the file before upload; its output feeds both the upload and
   * the stored aspect ratio. */
  normalize: (image: LocalImage) => Promise<LocalImage>;
  upload: (image: LocalImage, uploadUrl: string) => Promise<Id<"_storage">>;
  attach: (
    operationId: string,
    storageId: Id<"_storage">,
  ) => Promise<FunctionReturnType<typeof api.items.attachImageUpload>>;
  finalize: (input: {
    operationId: string;
    aspectRatio?: number;
    isSticker?: boolean;
    capturedAt?: number;
    latitude?: number;
    longitude?: number;
    spaceId?: Id<"spaces">;
  }) => Promise<Id<"items">>;
};

const REASON_BY_CODE: Record<SaveErrorCode, ImageSaveFailureReason> = {
  photo_limit: "photo_limit",
  image_too_large: "too_large",
  // Neither has its own bucket; the paywall route is what a pro_required
  // failure is actually measured by (`paywall_requested`).
  image_empty: "other",
  pro_required: "other",
};

/** Buckets a failed result for analytics. Prefers the structured code, so a
 * copy edit on the server cannot re-bucket every installed client. The message
 * comparison is the fallback for a server that still throws bare sentences and
 * for the client-side size check; delete it once no such server is live. */
export function saveFailureReason(
  message: string,
  code?: SaveErrorCode,
): ImageSaveFailureReason {
  if (code) return REASON_BY_CODE[code];
  if (message === PHOTO_LIMIT_MESSAGE) return "photo_limit";
  if (message === IMAGE_TOO_LARGE_MESSAGE) return "too_large";
  return "other";
}

/** One `images_save_failed` event per distinct reason in a batch, so a mixed
 * batch (one over quota, one too large) is not counted under a single bucket. */
export function reportSaveFailures(results: ImageSaveResult[]): void {
  const counts = new Map<ImageSaveFailureReason, number>();
  for (const result of results) {
    if (result.status !== "failed") continue;
    const reason = saveFailureReason(result.message, result.code);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  for (const [reason, imageCount] of counts) {
    analytics.capture("images_save_failed", {
      reason,
      image_count: imageCount,
    });
  }
}

/** Prefix lets operation ids stand out in server logs while keeping the UUID
 * as the stable, unique portion. */
function generateOperationId(): string {
  return `image:${Crypto.randomUUID()}`;
}

/** Normalizing decodes the full original; ten 12MP photos at once is enough
 * to get the app killed for memory. */
export const MAX_CONCURRENT_SAVES = 3;

/**
 * Drives the begin -> upload -> attach -> finalize lifecycle for each image
 * (at most MAX_CONCURRENT_SAVES at a time) and returns one settled result per
 * input, in input order. Each task catches its own errors, so a failure is
 * reported as data rather than discarding sibling successes. A request without
 * an operationId gets a fresh one; a retry must pass the failed result's id.
 */
export async function saveImageOperations(
  requests: ImageSaveRequest[],
  deps: SaveImageDeps,
  options?: { spaceId?: Id<"spaces"> },
): Promise<ImageSaveResult[]> {
  const results: ImageSaveResult[] = new Array(requests.length);
  let next = 0;
  const worker = async () => {
    while (next < requests.length) {
      const index = next++;
      results[index] = await saveImageOperation(requests[index], deps, options);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_SAVES, requests.length) },
      worker,
    ),
  );
  return results;
}

async function saveImageOperation(
  request: ImageSaveRequest,
  deps: SaveImageDeps,
  options?: { spaceId?: Id<"spaces"> },
): Promise<ImageSaveResult> {
  const image = request.image;
  let stage: ImageSaveStage = "begin";
  // Minted inside the try: if id generation itself throws, that image must
  // settle as a failed result like any other error.
  let operationId = request.operationId;
  try {
    // `||` (not `??`): the empty-string placeholder from a mint failure
    // must also get a fresh id on retry.
    operationId = operationId || generateOperationId();
    const began = await deps.begin(operationId);
    if (began.kind === "complete") {
      // Already finalized server-side (a previous attempt landed); skip the
      // upload entirely and report the existing item.
      return { status: "saved", operationId, image, itemId: began.itemId };
    }

    stage = "normalize";
    const stored = await deps.normalize(image);

    stage = "upload";
    const uploadedStorageId = await deps.upload(stored, began.uploadUrl);

    stage = "attach";
    // Attach records the uploaded storage id on the pending operation (and,
    // for a racing retry that already attached a different id, discards this
    // redundant upload server-side). finalize reads the canonical id back
    // from the ledger. Rejections must stop this operation before finalize.
    const attached = await deps.attach(operationId, uploadedStorageId);
    if (attached.error) throw new Error(attached.error);

    stage = "finalize";
    const aspectRatio =
      stored.width && stored.height ? stored.width / stored.height : undefined;
    const itemId = await deps.finalize({
      operationId,
      aspectRatio,
      isSticker: image.isSticker,
      capturedAt: image.capturedAt,
      latitude: image.latitude,
      longitude: image.longitude,
      spaceId: options?.spaceId,
    });
    return { status: "saved", operationId, image, itemId };
  } catch (error) {
    return {
      status: "failed",
      // Only undefined if minting itself threw; the placeholder keeps the
      // result shape intact and a retry of it simply mints a fresh id.
      operationId: operationId ?? "",
      image,
      stage,
      message: userSafeMessage(error, `Could not complete (${stage})`),
      code: saveErrorCode(error) ?? undefined,
    };
  }
}

/**
 * React/Convex adapter that binds saveImageOperations to the image import
 * mutations. Returns one result per input image, in input order; a single
 * image failure no longer rejects the whole batch.
 */
export function useSaveImages() {
  const beginImageImport = useMutation(api.items.beginImageImport);
  const attachImageUpload = useMutation(api.items.attachImageUpload);
  const finalizeImageImport = useMutation(api.items.finalizeImageImport);

  return useCallback(
    async (
      requests: ImageSaveRequest[],
      options?: { spaceId?: Id<"spaces"> },
    ): Promise<ImageSaveResult[]> => {
      const deps: SaveImageDeps = {
        begin: (operationId) => beginImageImport({ operationId }),
        normalize: normalizeImage,
        upload: async (image, uploadUrl) => {
          const file = new File(image.uri);
          const error = imageSizeError(file.size);
          if (error) throw new Error(error);
          const result = await expoFetch(uploadUrl, {
            method: "POST",
            headers: image.mimeType?.startsWith("image/")
              ? { "Content-Type": image.mimeType }
              : {},
            body: file,
          });
          if (!result.ok) {
            throw new Error(`Upload failed (${result.status})`);
          }
          const { storageId } = (await result.json()) as {
            storageId: Id<"_storage">;
          };
          return storageId;
        },
        attach: (operationId, storageId) =>
          attachImageUpload({ operationId, storageId }),
        finalize: (input) =>
          finalizeImageImport({
            ...input,
            analyticsSessionId: analytics.sessionId(),
          }),
      };
      return await saveImageOperations(requests, deps, options);
    },
    [beginImageImport, attachImageUpload, finalizeImageImport],
  );
}
