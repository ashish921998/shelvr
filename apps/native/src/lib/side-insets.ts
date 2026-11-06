type SideInsets = { left: number; right: number };

/**
 * Padding that keeps content out of the side safe areas. An unfolded iPhone Duo keeps a strip
 * down its right edge for the status bar, the header buttons and the tab bar; on a portrait
 * iPhone both sides are zero, so this changes nothing there.
 */
export function sidePadding(insets: SideInsets, base = 0) {
  return { paddingLeft: base + insets.left, paddingRight: base + insets.right };
}

/** The same edges for an absolutely placed view, such as a sheet or a bottom bar over a map. */
export function sideOffsets(insets: SideInsets, base = 0) {
  return { left: base + insets.left, right: base + insets.right };
}

/** The width left for content between the side insets, for layouts sized from the window. */
export function contentWidth(width: number, insets: SideInsets) {
  return Math.max(width - insets.left - insets.right, 0);
}
