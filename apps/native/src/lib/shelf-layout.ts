// How saves stand on a shelf. Pure geometry, so the numbers are testable and
// the same in a worklet.
//
// The point of the sizing is a skyline: a portrait save is taller and narrower
// than a landscape one, so a row of cards has a varied top edge instead of
// reading as a grid that lost its gridlines.

/** A card's box on the shelf. */
type CardSize = { width: number; height: number };

const PORTRAIT: CardSize = { width: 72, height: 118 };
const SQUARE: CardSize = { width: 96, height: 104 };
const LANDSCAPE: CardSize = { width: 116, height: 80 };

/** Cards never shrink to fit; a narrow screen shows fewer of them. */
export function cardSize(aspectRatio: number | undefined): CardSize {
  "worklet";
  if (
    aspectRatio === undefined ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return SQUARE;
  }
  if (aspectRatio < 0.9) return PORTRAIT;
  if (aspectRatio > 1.2) return LANDSCAPE;
  return SQUARE;
}

/** The lean a card stands at, between -1.5° and 1.5°, fixed per card so it
 * never changes as the row re-renders. Rotation is about the bottom edge —
 * a card pivots where it touches the shelf, not around its middle. */
export function cardTilt(seed: number): number {
  "worklet";
  return Math.sin(seed * 2.3 + 1.1) * 1.5;
}

/** How many cards take a turn in the stagger: about what a phone shows of a
 * row before it scrolls. */
export const STAGGERED_CARDS = 6;

/** The pause before card `index` drops, in ms. Each card waits 80–150ms
 * longer than the one before it, so a row lands one at a time rather than all
 * at once, and the gaps vary so the rhythm is not metronomic.
 *
 * Every card in a row mounts at once, so an uncapped stagger would leave the
 * fortieth card blank for seconds after the reader has scrolled to it. Cards
 * past the first `STAGGERED_CARDS` drop with the last of them instead. */
export function dropDelay(index: number): number {
  "worklet";
  const turn = Math.min(index, STAGGERED_CARDS - 1);
  let total = 0;
  for (let i = 1; i <= turn; i++) total += 80 + (i % 3) * 35;
  return total;
}

/** The reference drop: 800ms, then a 350ms squash as it settles. */
export const DROP_MS = 800;
export const SQUASH_MS = 350;
/** How far above its resting place a card starts. */
export const DROP_FROM = -26;

/** Whether a scrolled row is close enough to its last card to fetch more:
 * within half a row's width of the end, or with nothing to scroll at all. A
 * row not laid out yet is never at its end. */
export function nearRowEnd({
  offset,
  layout,
  content,
}: {
  offset: number;
  layout: number;
  content: number;
}): boolean {
  if (layout <= 0 || content <= 0) return false;
  return offset + layout >= content - layout / 2;
}
