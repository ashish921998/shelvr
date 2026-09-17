// Tracks whether this launch is taking the user somewhere specific — a Share
// Sheet intent, a deep link, a universal link, a tapped notification — rather
// than simply opening the app.
//
// The launch animation is for the second case only. In front of "save this
// link" it is five seconds between the user and the thing they asked for, so
// the splash stands down and hands straight over.
//
// Expo Router resolves the initial URL asynchronously, so the answer can arrive
// either before the root layout mounts or a frame or two after. Both are
// covered: the flag is readable synchronously, and late arrivals notify.

/**
 * Whether a native-intent path is a link into the app rather than a plain
 * launch. Absolute URLs (`shelvr://…`, `https://shelvr.app/…`) are links;
 * relative or malformed paths are not.
 */
export function isDeepLink(path: string): boolean {
  try {
    // Absolute URLs parse without a base; relative paths throw.
    return new URL(path).protocol !== "";
  } catch {
    return false;
  }
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
