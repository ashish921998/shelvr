export function isEmptySpace(space: {
  itemCount: number;
  suggestionCount: number;
}): boolean {
  return space.itemCount === 0 && space.suggestionCount === 0;
}
