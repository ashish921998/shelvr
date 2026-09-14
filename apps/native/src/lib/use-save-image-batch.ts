import { localizeError, t } from "@/lib/i18n";
import { openPaywall } from "@/lib/entitlement";
import {
  type ImageSaveRequest,
  type ImageSaveResult,
  reportSaveFailures,
  useSaveImages,
} from "@/lib/use-save-image";
import type { Id } from "@convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { Alert } from "react-native";

/** One alert button. Structurally a react-native `AlertButton`, redeclared so
 * the protocol below stays free of React Native types and testable in Node. */
type BatchAlertButton = { text: string; onPress?: () => void };

/**
 * Everything the batch protocol needs from its host screen. A dependency
 * object (like `SaveImageDeps`) so the protocol is unit-testable with fakes and
 * so `useSaveImageBatch` can bind the React/Convex/React Native versions.
 */
export type ImageBatchDeps = {
  saveImages: (
    requests: ImageSaveRequest[],
    options?: { spaceId?: Id<"spaces"> },
  ) => Promise<ImageSaveResult[]>;
  /** `Alert.alert`, injected so a test can drive the retry button. */
  alert: (title: string, message: string, buttons: BatchAlertButton[]) => void;
  /** Routes to the paywall after a `pro_required` refusal. */
  openPaywall: () => Promise<unknown>;
  /** The host screen's own in-flight flag. */
  setBusy: (busy: boolean) => void;
  /** Fires exactly once when every request settled as saved. `results` is
   * empty for the degenerate empty batch, which short-circuits here. */
  onAllSaved: (results: ImageSaveResult[]) => void;
  /** The partial-failure alert's dismissal button. */
  onDismiss: () => void;
  /** The batch itself threw, rather than an image settling as failed. The two
   * host screens log and word this differently, so it stays theirs. */
  onUnexpectedError: (error: unknown) => void;
  /** Pins every save in the batch to a space (set when the flow was opened
   * from inside one). */
  spaceId?: Id<"spaces">;
};

/**
 * Runs a batch of image requests, handing an all-saved batch to the host and
 * otherwise reporting a partial outcome. Only failed requests are retained for
 * a retry — successful ones are never resubmitted — and each retry replays the
 * failed request's existing operation id so the backend `itemOperations` ledger
 * resumes that operation instead of starting a second one per image.
 */
export async function runImageBatch(
  requests: ImageSaveRequest[],
  deps: ImageBatchDeps,
): Promise<void> {
  if (requests.length === 0) {
    deps.onAllSaved([]);
    return;
  }
  deps.setBusy(true);
  try {
    const results = await deps.saveImages(requests, { spaceId: deps.spaceId });
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length === 0) {
      deps.onAllSaved(results);
      return;
    }
    const savedCount = results.length - failed.length;
    reportSaveFailures(results);
    // Takes precedence over the partial-failure alert: once Pro has lapsed,
    // retrying cannot succeed, so the paywall is the only useful next step.
    if (failed.some((r) => r.code === "pro_required")) {
      deps.setBusy(false);
      await deps.openPaywall();
      return;
    }
    deps.alert(
      t("errors.batchSaveTitle"),
      t("capture.partialFailure", {
        reason: localizeError(failed[0].message),
        saved: savedCount,
        total: results.length,
      }),
      [
        {
          text: t("capture.retryFailed"),
          onPress: () => {
            void runImageBatch(
              // Reuse each failed operation id on retry — never mint fresh ones.
              failed.map((r) => ({
                image: r.image,
                operationId: r.operationId,
              })),
              deps,
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

/** The host-supplied half of `ImageBatchDeps`; the rest is bound by the hook. */
type ImageBatchOptions = Omit<
  ImageBatchDeps,
  "saveImages" | "alert" | "openPaywall"
> & {
  /** Paywall funnel placement used for a `pro_required` refusal. */
  paywallPlacement: string;
};

/**
 * React adapter that binds `runImageBatch` to the image import mutations, the
 * platform alert, and the paywall route. Returns the batch runner; a retry is
 * driven from inside the alert, so the host only ever calls it with a freshly
 * built set of requests.
 */
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
