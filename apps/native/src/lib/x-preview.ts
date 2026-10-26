import { xStatusId } from "@convex/model/externalUrl";

// The X reader ends the text with "…" when X only gave a preview
// (an Article's preview_text, or a long post's first 280 characters).
export function isCutOffXPreview(item: {
  url?: string;
  content?: string;
}): boolean {
  return (
    xStatusId(item.url) !== undefined &&
    (item.content?.trimEnd().endsWith("…") ?? false)
  );
}
