/** The per-glyph Skia morph cannot shape non-ASCII scripts or grapheme clusters. */
export function needsNativeText(text: string): boolean {
  return /[^\u0020-\u007e]/.test(text);
}
