function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

export function isDeepLink(path: string, rootUrl: string): boolean {
  const target = normalizeUrl(path);
  if (target === null) return false;
  return target !== normalizeUrl(rootUrl);
}

let directLaunch = false;
const listeners = new Set<() => void>();

export function markDirectLaunch(): void {
  if (directLaunch) return;
  directLaunch = true;
  for (const listener of [...listeners]) listener();
}

export function isDirectLaunch(): boolean {
  return directLaunch;
}

export function subscribeDirectLaunch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetDirectLaunchForTests(): void {
  directLaunch = false;
  listeners.clear();
}
