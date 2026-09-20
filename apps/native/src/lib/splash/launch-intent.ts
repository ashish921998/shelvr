// Tracks whether this launch is taking the user somewhere specific — a Share
// Sheet intent, a deep link, a universal link, a tapped notification — rather
// than simply opening the app.
//
// The launch animation is for the second case only. In front of "save this
// link" it is seconds between the user and the thing they asked for, so the
// splash stands down and hands straight over.
//
// Expo Router resolves the initial URL asynchronously, so the answer can arrive
// either before the root layout mounts or a frame or two after. Both are
// covered: the flag is readable synchronously, and late arrivals notify.

/**
 * Comparable form of a URL: scheme, host (with port) and path, with trailing
 * slashes removed so `shelvr://` and `shelvr:///` are the same place. Returns
 * null for relative or malformed input.
 */
function normalizeUrl(url: string): string | null {
  try {
    // Absolute URLs parse without a base; relative paths throw.
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * Whether a native-intent path is a link into somewhere in the app, rather
 * than a plain launch.
 *
 * This needs `rootUrl` — `Linking.createURL('/')` — because Expo Router does
 * not hand us nothing when the app is opened from the home screen: its
 * `getInitialURL` falls back to that root URL and passes it through
 * `redirectSystemPath` exactly like a real link. Testing for "parses as an
 * absolute URL" therefore matches *every* launch, which is why this takes the
 * root to compare against instead.
 */
export function isDeepLink(path: string, rootUrl: string): boolean {
  const target = normalizeUrl(path);
  if (target === null) return false;
  return target !== normalizeUrl(rootUrl);
}

let directLaunch = false;
const listeners = new Set<() => void>();

/**
 * Records that this launch is heading somewhere specific. Safe to call more
 * than once and from anywhere, including before React has mounted.
 */
export function markDirectLaunch(): void {
  if (directLaunch) return;
  directLaunch = true;
  for (const listener of [...listeners]) listener();
}

export function isDirectLaunch(): boolean {
  return directLaunch;
}

/** Notifies if the launch turns out to be direct after the splash has begun. */
export function subscribeDirectLaunch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: the flag is process-wide and would otherwise leak between cases. */
export function resetDirectLaunchForTests(): void {
  directLaunch = false;
  listeners.clear();
}
