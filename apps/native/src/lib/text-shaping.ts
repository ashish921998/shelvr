/** Latin glyphs and ordinary punctuation can use the existing Skia morph.
 * Joined scripts, combining marks, bidi controls and emoji need native runs.
 * The caller additionally verifies coverage in the actual loaded font. */
export function needsNativeText(text: string): boolean {
  return /[^\u0020-\u024f\u2000-\u206f]|\p{M}|[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(
    text,
  );
}
