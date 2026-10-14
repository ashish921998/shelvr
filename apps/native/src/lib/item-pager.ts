/**
 * Where the item pager must jump after its list changed under it.
 *
 * The pager holds a scroll offset, not an item. When the list reorders (an
 * accepted suggestion moves from the suggestions block to the saved block) the
 * same offset shows a different save, while the header and the action menu
 * still target the one the user opened. Returns the active save's new index
 * when it moved, or null when the pager is already on it or it left the list.
 */
export function pagerResyncIndex(
  previous: readonly { _id: string }[] | undefined,
  next: readonly { _id: string }[] | undefined,
  activeId: string,
): number | null {
  if (!previous || !next || previous === next) return null;
  const was = previous.findIndex((item) => item._id === activeId);
  const now = next.findIndex((item) => item._id === activeId);
  if (was < 0 || now < 0 || was === now) return null;
  return now;
}
