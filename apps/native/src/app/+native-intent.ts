import { markPendingShare } from '@/lib/share/pending-share-store';

// expo-sharing launches the app with a `<scheme>://expo-sharing` deep link when
// something is shared into Shelvr from another app. Route those to the receiver
// screen; leave every other deep link untouched.
//
// Always mark a pending-share flag too. If the user is mid-onboarding or signed
// out, the app layout guards will redirect away from `/share` — the flag lets
// us resume the share after onboarding + auth instead of dropping it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') {
      markPendingShare();
      return '/share';
    }
  } catch {
    // Relative/malformed paths aren't share intents — fall through.
  }
  return path;
}
