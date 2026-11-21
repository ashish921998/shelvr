export const ROOT_TAB = "(map)";
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

export function resolveRootHref(url: string): string {
  if (RETIRED_ROUTE.test(url)) return HOME;
  for (const [route, tab] of TAB_ROUTES) {
    if (route.test(url)) return url.replace(route, tab);
  }
  return url.replace(/^\/(?=[?#]|$)/, `/(app)/(tabs)/${ROOT_TAB}`);
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
