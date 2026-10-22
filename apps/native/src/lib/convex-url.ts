export function readConvexUrl(): string {
  const url = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL is missing: the build did not inline the Convex deployment URL.",
    );
  }
  return url;
}
