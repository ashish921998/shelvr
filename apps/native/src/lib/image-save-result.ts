import type { ImageSaveResult } from "@/lib/use-save-image";

/** The result `saveImages` returns for a one-image request; it returns one
 * result per request, in order. Kept out of `use-save-image` so screens that
 * mock that native-backed module still get the real check. */
export function onlyResult(results: ImageSaveResult[]): ImageSaveResult {
  const [result] = results;
  if (result === undefined) throw new Error("image_save_result_missing");
  return result;
}
