const SHEETS = new Set(["/add", "/camera", "/new-space", "/manage-spaces"]);

type PendingLink = { route: string; sheet: boolean };

let holding = true;
let pending: PendingLink | null = null;

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
  pending = route ? { route, sheet: true } : null;
}

export function deferLink(href: string): boolean {
  if (!holding) return false;
  const sheet = sheetRouteOf(href);
  pending = sheet
    ? { route: sheet, sheet: true }
    : { route: href, sheet: false };
  return true;
}

export function releaseSheetLink(planLoading: boolean): PendingLink | null {
  holding = planLoading;
  if (planLoading) return null;
  const link = pending;
  pending = null;
  return link;
}
