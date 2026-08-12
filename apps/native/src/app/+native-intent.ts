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
    const url = new URL(path);

    // The OAuth browser session receives this URL to finish the token
    // exchange. Expo Router receives the same native intent and would also
    // try to render `/auth/callback`, which is not an app screen. Keep the
    // user on sign-in until Convex Auth flips the authenticated route guard.
    const isOAuthCallback =
      url.protocol === 'shelvr:' &&
      ((url.hostname === 'auth' && url.pathname === '/callback') ||
        (url.hostname === '' && url.pathname === '/auth/callback'));
    if (isOAuthCallback) {
      return '/sign-in';
    }

    if (url.hostname === 'expo-sharing') {
      try {
        markPendingShare();
      } catch {
        // Best-effort: a SecureStore failure loses only the resume flag —
        // it must not stop this recognized share from routing to /share.
      }
      return '/share';
    }
  } catch {
    // Relative/malformed paths aren't share intents — fall through.
  }
  return path;
}
