// Sheets (Add, Camera, New space, Manage spaces) wait for a known plan in
// `(app)/_layout.tsx`, so a deep link to one that arrives first is redirected
// away. `+native-intent.ts` remembers it here while the plan is unknown, and
// the layout opens it once the plan is known and Pro, or drops it if gated.

const SHEETS = new Set(["/add", "/camera", "/new-space", "/manage-spaces"]);

// Starts held: a cold-launch link lands before the plan has loaded.
let holding = true;
let pending: string | null = null;

/** The sheet route a link points at, with its query, or null. */
export function sheetRouteOf(link: string): string | null {
  try {
    const url = link.startsWith("/")
      ? new URL(link, "shelvr://")
      : new URL(link);
    const segments = [url.host, ...url.pathname.split("/")].filter(Boolean);
    const route = `/${segments.join("/")}`;
    return SHEETS.has(route) ? `${route}${url.search}` : null;
  } catch {
    return null;
  }
}

export function rememberSheetLink(link: string): void {
  if (!holding) return;
  const route = sheetRouteOf(link);
  if (route) pending = route;
}

/** Sets whether the plan is still loading; once known, hands back the link. */
export function releaseSheetLink(planLoading: boolean): string | null {
  holding = planLoading;
  if (planLoading) return null;
  const route = pending;
  pending = null;
  return route;
}
