export const ROOT_TAB = "(map)";
const HOME = "/(app)/(tabs)/(home)";
const MAP = `/(app)/(tabs)/${ROOT_TAB}`;

// The Map tab's index adds no segment to the URL, so "/map" would match nothing.
const MAP_ROUTE =
  /^\/(?:\(app\)\/)?(?:\(tabs\)\/)?(?:\(map\)|map)\/?(?=[?#]|$)/;

// Screens the app no longer has; old links, scheduled pushes and shortcuts to them open Home.
const RETIRED_ROUTE =
  /^\/(?:\(app\)\/)?(?:\(tabs\)\/)?(?:\((?:spaces|search)\)|spaces|search|space|digest|new-space|manage-spaces|camera|trip|plan)(?=[/?#]|$)/;

export function resolveRootHref(url: string): string {
  if (RETIRED_ROUTE.test(url)) return HOME;
  if (MAP_ROUTE.test(url)) return url.replace(MAP_ROUTE, MAP);
  return url.replace(/^\/(?=[?#]|$)/, MAP);
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
