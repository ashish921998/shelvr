/**
 * Since Expo Router 58, "/" matches the index of every tab group and the
 * router picks the shortest group name, which opens Map. Runtime URLs (a
 * notification already scheduled with "/", the Convex Auth sign-in return)
 * go through this so the root still opens Home.
 */
export function resolveRootHref(url: string): string {
  return url.replace(/^\/(?=[?#]|$)/, "/(app)/(tabs)/(home)");
}
