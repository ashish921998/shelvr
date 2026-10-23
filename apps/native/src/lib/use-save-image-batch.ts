import { localizeError, t } from "@/lib/i18n";
import { openPaywall } from "@/lib/entitlement";
import {
  type ImageSaveRequest,
  type ImageSaveResult,
  reportSaveFailures,
  useSaveImages,
} from "@/lib/use-save-image";
import type { Id } from "@convex/_generated/dataModel";
import type { SaveSource } from "@convex/model/saveSource";
import { useRouter } from "expo-router";
import { Alert } from "react-native";

type BatchAlertButton = { text: string; onPress?: () => void };

export type ImageBatchDeps = {
  saveImages: (
    requests: ImageSaveRequest[],
    options?: { spaceId?: Id<"spaces">; saveSource?: SaveSource },
  ) => Promise<ImageSaveResult[]>;
  alert: (title: string, message: string, buttons: BatchAlertButton[]) => void;
  openPaywall: () => Promise<unknown>;
  setBusy: (busy: boolean) => void;
  onAllSaved: (results: ImageSaveResult[]) => void;
  onDismiss: () => void;
  onUnexpectedError: (error: unknown) => void;
  spaceId?: Id<"spaces">;
  saveSource?: SaveSource;
};

export async function runImageBatch(
  requests: ImageSaveRequest[],
  deps: ImageBatchDeps,
  alreadySaved: ImageSaveResult[] = [],
): Promise<void> {
  if (requests.length === 0) {
    deps.onAllSaved(alreadySaved);
    return;
  }
  deps.setBusy(true);
  try {
    const results = await deps.saveImages(requests, {
      spaceId: deps.spaceId,
      saveSource: deps.saveSource,
    });
    const failed = results.filter((r) => r.status === "failed");
    const savedSoFar = [
      ...alreadySaved,
      ...results.filter((r) => r.status === "saved"),
    ];
    if (failed.length === 0) {
      deps.onAllSaved(savedSoFar);
      return;
    }
    reportSaveFailures(results);
    const otherFailures = failed.filter((r) => r.code !== "pro_required");
    if (otherFailures.length < failed.length) {
      await deps.openPaywall();
      if (otherFailures.length === 0) {
        deps.setBusy(false);
        return;
      }
    }
    deps.alert(
      t("errors.batchSaveTitle"),
      t("capture.partialFailure", {
        reason: localizeError(otherFailures[0]?.message),
        saved: savedSoFar.length,
        total: savedSoFar.length + failed.length,
      }),
      [
        {
          text: t("capture.retryFailed"),
          onPress: () => {
            void runImageBatch(
              failed.map((r) => ({
                image: r.image,
                operationId: r.operationId,
              })),
              deps,
              savedSoFar,
            );
          },
        },
        { text: t("common.done"), onPress: deps.onDismiss },
      ],
    );
    deps.setBusy(false);
  } catch (error) {
    deps.onUnexpectedError(error);
    deps.setBusy(false);
  }
}

type ImageBatchOptions = Omit<
  ImageBatchDeps,
  "saveImages" | "alert" | "openPaywall"
> & {
  paywallPlacement: string;
};

export function useSaveImageBatch(
  options: ImageBatchOptions,
): (requests: ImageSaveRequest[]) => Promise<void> {
  const router = useRouter();
  const saveImages = useSaveImages();
  const { paywallPlacement, ...host } = options;

  return (requests) =>
    runImageBatch(requests, {
      ...host,
      saveImages,
      alert: (title, message, buttons) => Alert.alert(title, message, buttons),
      openPaywall: () => openPaywall(router, paywallPlacement),
    });
}
