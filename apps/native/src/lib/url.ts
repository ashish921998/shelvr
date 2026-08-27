const URL_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i;

export function isProbablyUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return URL_PATTERN.test(trimmed);
}

/** Extracts the first http(s) URL embedded in a block of text, or null.
 * Share-sheet payloads from real apps (TikTok, Instagram, X) usually wrap the
 * URL in template caption text ("Check out this video! https://...") rather
 * than sending a bare URL, so link detection has to look INSIDE the text.
 * Trailing sentence punctuation is stripped so the extracted link saves
 * cleanly. Returns null when the text contains no http(s) URL. */
export function extractFirstUrl(text: string): string | null {
  const match = text.trim().match(/https?:\/\/[^\s<>"]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;:!?'")\]]+$/, '');
}

export function displayHost(url: string | undefined) {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    return url;
  }
}
