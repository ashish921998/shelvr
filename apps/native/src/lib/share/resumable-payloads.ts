import { shareWasDiscardedOnDevice } from "@/lib/share/pending-share-store";
import {
  fingerprintSharePayloads,
  type RawSharePayload,
} from "@/lib/share/storage";
import { getSharedPayloads } from "expo-sharing";

export function hasResumableSharedPayloads(): boolean {
  try {
    const payloads: RawSharePayload[] = getSharedPayloads().map((payload) => ({
      value: payload.value,
      shareType: payload.shareType,
      mimeType: payload.mimeType,
    }));
    if (payloads.length === 0) return false;
    return !shareWasDiscardedOnDevice(fingerprintSharePayloads(payloads));
  } catch {
    return false;
  }
}
