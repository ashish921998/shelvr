/**
 * Branded preview page for a shared item (`apps/web/src/app/i/[id]`). The
 * item id is the capability: no auth, so this is safe to hand to the OS
 * share sheet the same way a Google Doc or Figma share link would be.
 */
export function shareableItemUrl(itemId: string): string {
  return `https://shelvr-web.vercel.app/i/${itemId}`;
}
