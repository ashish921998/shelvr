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
