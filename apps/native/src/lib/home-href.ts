const HOME = "/(app)/(tabs)/(home)";

// A tab's index adds no segment to the URL, so "/map" would match nothing.
const TAB_ROUTES = ["map", "passport"].map(
  (tab) =>
    [
      new RegExp(
        `^\\/(?:\\(app\\)\\/)?(?:\\(tabs\\)\\/)?(?:\\(${tab}\\)|${tab})\\/?(?=[?#]|$)`,
      ),
      `/(app)/(tabs)/(${tab})`,
    ] as const,
);

// Screens the app no longer has; old links, scheduled pushes and shortcuts to them open Home.
const RETIRED_ROUTE =
  /^\/(?:\(app\)\/)?(?:\(tabs\)\/)?(?:\((?:spaces|search)\)|spaces|search|space|digest|new-space|manage-spaces|camera|trip|plan)(?=[/?#]|$)/;

/**
 * Since Expo Router 58, "/" matches the index of every tab group and the
 * router picks the shortest group name. Runtime URLs (a notification already
 * scheduled with "/", the Convex Auth sign-in return) go through this so the
 * root, and any retired screen, opens Home.
 */
export function resolveRootHref(url: string): string {
  if (RETIRED_ROUTE.test(url)) return HOME;
  for (const [route, tab] of TAB_ROUTES) {
    if (route.test(url)) return url.replace(route, tab);
  }
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
