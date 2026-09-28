const URL_PATTERN = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i;

export function isProbablyUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  return URL_PATTERN.test(trimmed);
}

const TRAILING_PUNCTUATION = /[.,;:!?'"]/;

/** A closing bracket only ends the URL when the text never opened it — a caption
 * like "(see https://example.com/a)" borrows the paren, whereas
 * "https://en.wikipedia.org/wiki/Function_(mathematics)" needs its own. */
function closesMoreThanItOpens(url: string, open: string, close: string) {
  let depth = 0;
  for (const char of url) {
    if (char === open) depth += 1;
    else if (char === close) depth -= 1;
  }
  return depth < 0;
}

function trimTrailingPunctuation(url: string) {
  let trimmed = url;
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    const drop =
      TRAILING_PUNCTUATION.test(last) ||
      (last === ')' && closesMoreThanItOpens(trimmed, '(', ')')) ||
      (last === ']' && closesMoreThanItOpens(trimmed, '[', ']'));
    if (!drop) break;
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
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
  return trimTrailingPunctuation(match[0]);
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
