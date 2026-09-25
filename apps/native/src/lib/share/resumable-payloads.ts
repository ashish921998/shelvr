import { shareWasDiscardedOnDevice } from "@/lib/share/pending-share-store";
import {
  fingerprintSharePayloads,
  type RawSharePayload,
} from "@/lib/share/storage";
import { getSharedPayloads } from "expo-sharing";

/**
 * True when the native share store holds a batch the app owes the user a save
 * for. The store is the handoff between the OS share sheet and the share
 * screen: a batch stays readable until the share screen clears it after a
 * durable outcome, so "readable" alone means "a share is waiting" — with one
 * exception. A batch the user explicitly discarded whose native clear threw
 * stays in the store, and the resume path would route it straight back to the
 * share screen, re-saving the discarded batch under new operation ids. So the
 * batch's fingerprint is matched against the discard record first: the
 * leftover of a Cancel is not resumable, while any other batch — including a
 * later deliberate re-share, once the record was cleared — is.
 *
 * The launch URL alone cannot guarantee the handoff. On Android, a cold start
 * from the share sheet depends on `Linking.getInitialURL()` beating a 150ms
 * race in Expo Router's forked linking (a workaround for RN#25675); on a lost
 * race the launch is treated as a plain home-screen launch, and no `url`
 * event ever arrives to correct it, because RN emits that only from a warm
 * `onNewIntent`. The payloads themselves survive in the native store, so
 * reading the store directly recovers what the launch URL was carrying.
 *
 * Best-effort by design: the store is unavailable on web and missing in
 * limited environments, and a recovery read must never cost the caller its
 * behavior.
 */
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
