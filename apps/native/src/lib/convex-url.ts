// Single owner for the Convex deployment URL. Expo inlines EXPO_PUBLIC_* at
// build time; a missing value used to surface as Convex's generic "not an
// absolute URL" thrown from ConvexReactClient at import time — before any
// error boundary exists — with no hint at the env var. Fail with a named
// error instead, and route every reader through this one function so a
// missing URL can never silently collapse the scoped key namespaces below
// (auth tokens, notification tokens) into a shared "default".
export function readConvexUrl(): string {
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL is missing: the build did not inline the Convex deployment URL.",
    );
  }
  return url;
}
