import { imageSizeError } from "@convex/model/imagePolicy";
import {
  SAVE_ERROR_CODES,
  SAVE_ERROR_MESSAGES,
  saveErrorCode,
  saveFailureStage,
  type SaveErrorCode,
} from "@convex/model/saveErrors";
import type { SaveSource } from "@convex/model/saveSource";
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
  isSticker?: boolean;
  capturedAt?: number;
  latitude?: number;
  longitude?: number;
};

export type ImageSaveRequest = {
  image: LocalImage;
  operationId?: string;
};

type ImageSaveStage = "begin" | "normalize" | "upload" | "attach" | "finalize";

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
      code?: SaveErrorCode;
    };

export type SaveImageDeps = {
  begin: (
    operationId: string,
  ) => Promise<
    | { kind: "upload"; uploadUrl: string }
    | { kind: "complete"; itemId: Id<"items"> }
  >;
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
    saveSource?: SaveSource;
  }) => Promise<Id<"items">>;
};

const REASON_BY_CODE: Record<SaveErrorCode, ImageSaveFailureReason> = {
  photo_limit: "photo_limit",
  image_too_large: "too_large",
  image_empty: "other",
  pro_required: "other",
};

export function saveFailureReason(
  message: string,
  code?: SaveErrorCode,
): ImageSaveFailureReason {
  if (code) return REASON_BY_CODE[code];
  for (const saveCode of SAVE_ERROR_CODES) {
    if (message === SAVE_ERROR_MESSAGES[saveCode]) {
      return REASON_BY_CODE[saveCode];
    }
  }
  return "other";
}

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

function generateOperationId(): string {
  return `image:${Crypto.randomUUID()}`;
}

export const MAX_CONCURRENT_SAVES = 3;

export async function saveImageOperations(
  requests: ImageSaveRequest[],
  deps: SaveImageDeps,
  options?: { spaceId?: Id<"spaces">; saveSource?: SaveSource },
): Promise<ImageSaveResult[]> {
  const results: ImageSaveResult[] = new Array(requests.length);
  let next = 0;
  const worker = async () => {
    while (next < requests.length) {
      const index = next++;
      const request = requests[index];
      if (request === undefined) break;
      results[index] = await saveImageOperation(request, deps, options);
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
  options?: { spaceId?: Id<"spaces">; saveSource?: SaveSource },
): Promise<ImageSaveResult> {
  const image = request.image;
  let stage: ImageSaveStage = "begin";
  let operationId = request.operationId;
  try {
    operationId = operationId || generateOperationId();
    if (options?.saveSource !== undefined) {
      analytics.capture("save_attempt_started", {
        save_source: options.saveSource,
        save_kind: "image",
        operation_id: operationId,
      });
    }
    const began = await deps.begin(operationId);
    if (began.kind === "complete") {
      return { status: "saved", operationId, image, itemId: began.itemId };
    }

    stage = "normalize";
    const stored = await deps.normalize(image);

    stage = "upload";
    const uploadedStorageId = await deps.upload(stored, began.uploadUrl);

    stage = "attach";
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
      saveSource: options?.saveSource,
    });
    return { status: "saved", operationId, image, itemId };
  } catch (error) {
    if (options?.saveSource !== undefined) {
      analytics.capture("save_failed", {
        save_source: options.saveSource,
        save_kind: "image",
        stage: saveFailureStage(error),
        ...(operationId !== undefined && { operation_id: operationId }),
      });
    }
    return {
      status: "failed",
      operationId: operationId ?? "",
      image,
      stage,
      message: userSafeMessage(error, `Could not complete (${stage})`),
      code: saveErrorCode(error) ?? undefined,
    };
  }
}

export function useSaveImages() {
  const beginImageImport = useMutation(api.items.beginImageImport);
  const attachImageUpload = useMutation(api.items.attachImageUpload);
  const finalizeImageImport = useMutation(api.items.finalizeImageImport);

  return useCallback(
    async (
      requests: ImageSaveRequest[],
      options?: { spaceId?: Id<"spaces">; saveSource?: SaveSource },
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
