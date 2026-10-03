/** A space with nothing saved or suggested in it yet. The Spaces tab keeps
 * these out of its grid until a save lands in them. */
export function isEmptySpace(space: {
  itemCount: number;
  suggestionCount: number;
}): boolean {
  return space.itemCount === 0 && space.suggestionCount === 0;
}
