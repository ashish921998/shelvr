export const RUBBER_BAND_LIMIT = 56;

export function rubberBand(overflow: number, limit: number): number {
  "worklet";
  if (overflow === 0 || limit <= 0) return 0;
  const distance = Math.abs(overflow);
  return Math.sign(overflow) * ((limit * distance) / (distance + limit));
}

export function overflowPast(position: number, size: number): number {
  "worklet";
  if (position < 0) return position;
  if (position > size) return position - size;
  return 0;
}

export function tabIndexAt(
  x: number,
  width: number,
  count: number,
  inset: number,
): number {
  "worklet";
  if (count <= 0 || x < 0 || x > width) return -1;
  const inner = width - inset * 2;
  if (inner <= 0) return -1;
  const offset = Math.min(Math.max(x - inset, 0), inner);
  return Math.min(count - 1, Math.floor((offset / inner) * count));
}

export function tabSlotX(
  index: number,
  width: number,
  count: number,
  inset: number,
): number {
  "worklet";
  if (count <= 0) return inset;
  return inset + ((width - inset * 2) / count) * index;
}
