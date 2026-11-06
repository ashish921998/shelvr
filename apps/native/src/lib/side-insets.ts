export type SideInsets = { left: number; right: number };

export function sidePadding(insets: SideInsets, base = 0) {
  return { paddingLeft: base + insets.left, paddingRight: base + insets.right };
}

export function sideOffsets(insets: SideInsets, base = 0) {
  return { left: base + insets.left, right: base + insets.right };
}

export function contentWidth(width: number, insets: SideInsets) {
  return Math.max(width - insets.left - insets.right, 0);
}

export function centeredSheetInsets(
  sheetWidth: number,
  windowWidth: number,
  insets: SideInsets,
): SideInsets {
  const margin = Math.max(windowWidth - sheetWidth, 0) / 2;
  return {
    left: Math.max(insets.left - margin, 0),
    right: Math.max(insets.right - margin, 0),
  };
}
