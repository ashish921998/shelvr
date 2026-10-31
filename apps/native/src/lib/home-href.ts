const HOME = "/(app)/(tabs)/(home)";
const MAP = "/(app)/(tabs)/(map)";

// The Map tab's index adds no segment to the URL, so "/map" would match nothing.
const MAP_ROUTE =
  /^\/(?:\(app\)\/)?(?:\(tabs\)\/)?(?:\(map\)|map)\/?(?=[?#]|$)/;

// Screens the app no longer has; old links, scheduled pushes and shortcuts to them open Home.
const RETIRED_ROUTE =
  /^\/(?:\(app\)\/)?(?:\(tabs\)\/)?(?:\((?:spaces|search)\)|spaces|search|space|digest|new-space|manage-spaces|camera|trip)(?=[/?#]|$)/;

/**
 * Since Expo Router 58, "/" matches the index of every tab group and the
 * router picks the shortest group name. Runtime URLs (a notification already
 * scheduled with "/", the Convex Auth sign-in return) go through this so the
 * root, and any retired screen, opens Home.
 */
export function resolveRootHref(url: string): string {
  if (RETIRED_ROUTE.test(url)) return HOME;
  if (MAP_ROUTE.test(url)) return url.replace(MAP_ROUTE, MAP);
  return url.replace(/^\/(?=[?#]|$)/, HOME);
}

/** The in-app route an app-scheme link names, or null for any other URL. */
export function appSchemeRoute(link: string): string | null {
  try {
    const url = new URL(link);
    if (!["shelvr:", "shelvr-dev:", "shelvr-preview:"].includes(url.protocol)) {
      return null;
    }
    const segments = [url.host, ...url.pathname.split("/")].filter(Boolean);
    return `/${segments.join("/")}${url.search}`;
  } catch {
    return null;
  }
}
