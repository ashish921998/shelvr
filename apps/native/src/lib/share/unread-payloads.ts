import { getSharedPayloads } from "expo-sharing";

/**
 * True when the native share store still holds payloads no screen has
 * consumed. The store is the handoff between the OS share sheet and the
 * share screen: a batch stays readable until the share screen clears it
 * after a durable outcome (completed save, explicit discard, or a resumed
 * session), so "non-empty" means "a share is owed to the user".
 *
 * The launch URL alone cannot guarantee that handoff. On Android, a cold
 * start from the share sheet depends on `Linking.getInitialURL()` beating a
 * 150ms race in Expo Router's forked linking (a workaround for RN#25675); on
 * a lost race the launch is treated as a plain home-screen launch, and no
 * `url` event ever arrives to correct it, because RN emits that only from a
 * warm `onNewIntent`. The payloads themselves survive in the native store, so
 * reading the store directly recovers what the launch URL was carrying.
 *
 * Best-effort by design: the store is unavailable on web and missing in
 * limited environments, and a recovery read must never cost the caller its
 * behavior.
 */
export function hasUnreadSharedPayloads(): boolean {
  try {
    return getSharedPayloads().length > 0;
  } catch {
    return false;
  }
}
