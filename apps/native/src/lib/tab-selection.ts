export type TabSelection = {
  index: number;
  revision: number;
  pending: boolean;
};

export function requestTabSelection(
  selection: TabSelection,
  index: number,
): TabSelection {
  "worklet";
  return { index, revision: selection.revision + 1, pending: true };
}

export function reconcileTabSelection(
  selection: TabSelection,
  focusedIndex: number,
  renderedRevision: number,
): TabSelection {
  "worklet";
  if (renderedRevision !== selection.revision) return selection;
  if (focusedIndex < 0) return { ...selection, pending: false };
  if (selection.pending && focusedIndex !== selection.index) return selection;
  return { ...selection, index: focusedIndex, pending: false };
}
