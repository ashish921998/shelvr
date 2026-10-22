import { cityKey } from "@convex/model/trip";

const FRAME = { width: 390, height: 844 };

export const REVEAL_COVERS = 6;

export const REVEAL_LIFT = 36;

export const REVEAL_TIMING = {
  dots: 1500,
  wait: 2700,
  landed: 1100,
  done: 1400,
  roll: 1000,
  stagger: 40,
} as const;

type RevealSave = {
  _id: string;
  status: string;
  title?: string;
  imageUrl?: string | null;
  cities?: string[];
};

export type RevealCover = { id: string; title: string; imageUrl: string };

export function revealCovers(
  items: readonly RevealSave[],
  city: string | undefined,
): RevealCover[] {
  const covered = items.filter(
    (item): item is RevealSave & { imageUrl: string } =>
      item.status === "ready" && !!item.imageUrl,
  );
  const wanted = city === undefined ? undefined : cityKey(city);
  const inCity = (item: RevealSave) =>
    wanted !== undefined &&
    (item.cities ?? []).some((name) => cityKey(name) === wanted);
  return [...covered.filter(inCity), ...covered.filter((item) => !inCity(item))]
    .slice(0, REVEAL_COVERS)
    .map((item) => ({
      id: item._id,
      title: item.title ?? "",
      imageUrl: item.imageUrl,
    }));
}

const CARDS = [
  { rank: 4, dx: -6, r: -8, to: [150, 230] },
  { rank: 5, dx: 6, r: 7, to: [260, 250] },
  { rank: 2, dx: -4, r: 5, to: [110, 310] },
  { rank: 3, dx: 4, r: -10, to: [290, 340] },
  { rank: 0, dx: -8, r: 12, to: [170, 370] },
  { rank: 1, dx: 8, r: -6, to: [230, 420] },
] as const;

const EXTRA_DOTS = [
  [90, 270],
  [320, 300],
  [200, 300],
  [70, 390],
  [330, 420],
  [140, 450],
  [250, 360],
  [300, 200],
  [60, 340],
  [210, 470],
] as const;

export type RevealCard = {
  left: number;
  top: number;
  width: number;
  height: number;
  rank: number;
  dx: number;
  rotate: number;
  toX: number;
  toY: number;
};

type RevealLayout = {
  cards: RevealCard[];
  dots: { x: number; y: number }[];
  landing: { x: number; y: number };
};

export function revealLayout(
  width: number,
  height: number,
  covers: number,
): RevealLayout {
  const sx = width / FRAME.width;
  const sy = height / FRAME.height;
  const cardWidth = (width - 24) / 2;
  const gridTop = 228 * sy;
  const cardHeight = Math.min(
    cardWidth * 1.15,
    (height - gridTop + REVEAL_LIFT) / 3,
  );
  const used = CARDS.slice(0, covers);
  const cards = used.map((card, index) => {
    const left = 12 + (index % 2) * cardWidth;
    const top = gridTop + Math.floor(index / 2) * cardHeight;
    return {
      left,
      top,
      width: cardWidth,
      height: cardHeight,
      rank: card.rank,
      dx: card.dx,
      rotate: card.r,
      toX: card.to[0] * sx - (left + cardWidth / 2),
      toY: card.to[1] * sy - (top + cardHeight / 2),
    };
  });
  const dots = [...used.map((card) => card.to), ...EXTRA_DOTS].map(
    ([x, y]) => ({ x: x * sx, y: y * sy }),
  );
  return { cards, dots, landing: { x: width / 2, y: height / 2 } };
}
