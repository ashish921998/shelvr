const CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function pickMimeType(
  isSupported: (type: string) => boolean,
): string | undefined {
  return CANDIDATES.find((type) => isSupported(type));
}

export function bubbleLayout(width: number, height: number) {
  const size = Math.round(Math.min(width, height) * 0.22);
  const margin = Math.round(size * 0.15);
  return {
    size,
    x: margin,
    y: height - size - margin,
  };
}

export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
