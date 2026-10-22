export const MAX_MORPH_GLYPHS = 48;

export type MorphCell = {
  key: string;
  char: string;
  x: number;
  width: number;
  index: number;
  phase: "present" | "exit";
  animateIn?: boolean;
  exitAt?: number;
};

type MorphRender = {
  mode: "native" | "hold" | "morph";
  animateOnMount: boolean;
};

export function resolveMorphRender(
  fontReady: boolean,
  forceNative: boolean,
  paintedNative: boolean,
): MorphRender {
  if (forceNative) return { mode: "native", animateOnMount: false };
  if (!fontReady) {
    return { mode: paintedNative ? "native" : "hold", animateOnMount: false };
  }
  return { mode: "morph", animateOnMount: !paintedNative };
}

export function layoutMorphText(
  text: string,
  width: number,
  overscan: number,
  measure: (char: string) => number,
  ellipsis = true,
): MorphCell[] {
  if (width <= 0) return [];
  const glyphs: { char: string; width: number }[] = [];
  let total = 0;
  let truncated = false;
  for (const char of text) {
    const advance = Math.max(0, measure(char));
    if (glyphs.length === MAX_MORPH_GLYPHS || total + advance > width) {
      truncated = true;
      break;
    }
    glyphs.push({ char, width: advance });
    total += advance;
  }
  const ellipsisWidth = ellipsis ? Math.max(0, measure("…")) : 0;
  if (truncated && ellipsis && ellipsisWidth <= width) {
    while (
      glyphs.length > 0 &&
      (total + ellipsisWidth > width || glyphs.length === MAX_MORPH_GLYPHS)
    ) {
      const removed = glyphs.pop();
      if (!removed) break;
      total -= removed.width;
    }
    glyphs.push({ char: "…", width: ellipsisWidth });
    total += ellipsisWidth;
  }
  let cursor = overscan + (width - total) / 2;
  const counts = new Map<string, number>();
  return glyphs.map(({ char, width: advance }, index) => {
    const occurrence = counts.get(char) ?? 0;
    counts.set(char, occurrence + 1);
    const cell: MorphCell = {
      key: `${char}#${occurrence}`,
      char,
      x: cursor,
      width: advance,
      index,
      phase: "present",
    };
    cursor += advance;
    return cell;
  });
}

export type MorphTransition = { text: string; deadline: number | null };

export function includeMorphExits(
  transition: MorphTransition,
  cells: MorphCell[],
): MorphTransition {
  const deadline = cells.reduce(
    (latest, cell) => Math.max(latest, cell.exitAt ?? 0),
    transition.deadline ?? 0,
  );
  return deadline > (transition.deadline ?? 0)
    ? { ...transition, deadline }
    : transition;
}

export function advanceMorphTransition(
  previous: MorphTransition,
  text: string,
  glyphs: number,
  now: number,
  durationFor: (glyphs: number, interrupted: boolean) => number,
): { interrupted: boolean; next: MorphTransition } {
  if (text === previous.text) return { interrupted: false, next: previous };
  const interrupted = previous.deadline !== null && now < previous.deadline;
  return {
    interrupted,
    next: { text, deadline: now + durationFor(glyphs, interrupted) },
  };
}

export function reconcileMorphCells(
  previous: MorphCell[],
  present: MorphCell[],
  now: number,
  exitDuration: number,
  stagger: number,
  interrupted = false,
): MorphCell[] {
  if (interrupted) {
    return present.map((cell) => ({ ...cell, animateIn: false }));
  }
  const previousByKey = new Map(previous.map((cell) => [cell.key, cell]));
  const current = present.map((cell) => ({
    ...cell,
    animateIn:
      previousByKey.get(cell.key)?.animateIn ?? !previousByKey.has(cell.key),
  }));
  const keys = new Set(present.map((cell) => cell.key));
  const retiring: MorphCell[] = [];
  for (const old of previous) {
    if (keys.has(old.key)) continue;
    if (old.phase === "exit") {
      if ((old.exitAt ?? 0) > now) retiring.push(old);
    } else {
      retiring.push({
        ...old,
        phase: "exit",
        exitAt: now + exitDuration + old.index * stagger,
      });
    }
  }
  return [...current, ...retiring.slice(0, MAX_MORPH_GLYPHS)];
}

export function pruneMorphCells(cells: MorphCell[], now: number): MorphCell[] {
  return cells.filter(
    (cell) => cell.phase === "present" || (cell.exitAt ?? 0) > now,
  );
}
