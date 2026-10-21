// While the plan loads, one pending destination is shared by every entry
// point, so the newest link wins. Sheets (Add, Camera, New space, Manage
// spaces) wait for a known plan in `(app)/_layout.tsx`, so a deep link to one
// is redirected away; `+native-intent.ts` keeps it here. A notification tap
// waits here whatever it opens. The layout opens the destination once the
// plan is known: a sheet only for Pro, anything else as it would have.

const SHEETS = new Set(["/add", "/camera", "/new-space", "/manage-spaces"]);

type PendingLink = { route: string; sheet: boolean };

// Starts held: a cold-launch link lands before the plan has loaded.
let holding = true;
let pending: PendingLink | null = null;

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

/**
 * Call for every deep link. Expo Router opens a non-sheet link itself, so it
 * only discards an older pending destination; a sheet link waits here.
 */
export function rememberSheetLink(link: string): void {
  if (!holding) return;
  const route = sheetRouteOf(link);
  pending = route ? { route, sheet: true } : null;
}

/**
 * A notification tap: returns false when the plan is known and the caller
 * should open it now; otherwise it becomes the pending destination.
 */
export function deferLink(href: string): boolean {
  if (!holding) return false;
  const sheet = sheetRouteOf(href);
  pending = sheet
    ? { route: sheet, sheet: true }
    : { route: href, sheet: false };
  return true;
}

/** Sets whether the plan is still loading; once known, hands back the link. */
export function releaseSheetLink(planLoading: boolean): PendingLink | null {
  holding = planLoading;
  if (planLoading) return null;
  const link = pending;
  pending = null;
  return link;
}
