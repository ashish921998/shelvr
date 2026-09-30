// Colour math for theme colours in gradients. No React Native imports.

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** A `#rrggbb` theme colour as `rgba()`, for gradients that fade it out.
 * Anything else is returned unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** True for a dark `#rrggbb` colour, by perceived brightness. The tab bar
 * uses it to pick a highlight strength that reads on light and dark surfaces. */
export function isDarkColor(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness < 128;
}
