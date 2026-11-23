export const CLAIMED_HOSTS = ["tryshelvr.app", "shelvr-web.vercel.app"];

export function inviteToken(pathname: string): string | null {
  return /^\/l\/([^/?#]+)\/?$/.exec(pathname)?.[1] ?? null;
}

export function claimedInviteToken(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" && CLAIMED_HOSTS.includes(url.hostname)
      ? inviteToken(url.pathname)
      : null;
  } catch {
    return null;
  }
}
