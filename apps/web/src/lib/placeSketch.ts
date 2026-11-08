export const SKETCH_WIDTH = 320;

const MAX_PINS = 10;
const PER_ROW = 4;
const EDGE = 44;
const TOP = 48;
const ROW = 86;
const LABEL_OFFSET = 32;
const BOTTOM = 26;
const MORE_NOTE = 22;
const LABEL_UNITS = 12;
const WIDE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]|\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

type SketchPin = { n: number; x: number; y: number; label: string };

function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

function units(grapheme: string): number {
  return WIDE.test(grapheme) ? 2 : 1;
}

function label(name: string): string {
  const parts = graphemes(name.trim());
  if (parts.reduce((sum, part) => sum + units(part), 0) <= LABEL_UNITS)
    return parts.join("");
  const head: string[] = [];
  let used = 0;
  for (const part of parts) {
    const width = units(part);
    if (used + width > LABEL_UNITS - 1) break;
    head.push(part);
    used += width;
  }
  const space = head.lastIndexOf(" ");
  const cut =
    parts[head.length] !== " " && space >= 4 ? head.slice(0, space) : head;
  return `${cut.join("").trimEnd()}…`;
}

export function placeSketch(names: readonly string[]): {
  height: number;
  pins: SketchPin[];
  more: number;
} {
  const n = Math.min(names.length, MAX_PINS);
  if (n === 0) return { height: 0, pins: [], more: 0 };
  const step = (SKETCH_WIDTH - 2 * EDGE) / (PER_ROW - 1);
  const rows = Math.ceil(n / PER_ROW);
  const more = names.length - n;
  const pins = names.slice(0, n).map((name, i) => {
    const row = Math.floor(i / PER_ROW);
    const column = row % 2 === 0 ? i % PER_ROW : PER_ROW - 1 - (i % PER_ROW);
    const x =
      n >= PER_ROW
        ? EDGE + column * step
        : SKETCH_WIDTH / 2 + (column - (n - 1) / 2) * step;
    const y = TOP + row * ROW + ((i * 37) % 11) - 5;
    return {
      n: i + 1,
      x: Math.round(x * 10) / 10,
      y,
      label: label(name),
    };
  });
  return {
    height:
      TOP +
      (rows - 1) * ROW +
      LABEL_OFFSET +
      BOTTOM +
      (more > 0 ? MORE_NOTE : 0),
    pins,
    more,
  };
}
