import { framedPins } from "@/lib/city-pins";

export const CARD_MAX_PINS = 40;

type CardPoint<T> = { pin: T; x: number; y: number };

export function cardPoints<T extends { lat: number; lng: number }>(
  pins: readonly T[],
  box: { width: number; height: number; pad: number },
  visited: (pin: T) => boolean = () => false,
): CardPoint<T>[] {
  const shown = [
    ...pins.filter((pin) => visited(pin)),
    ...framedPins([...pins]).filter((pin) => !visited(pin)),
  ].slice(0, CARD_MAX_PINS);
  if (shown.length === 0) return [];
  const midLat = shown.reduce((sum, pin) => sum + pin.lat, 0) / shown.length;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const raw = shown.map((pin) => ({ pin, x: pin.lng * cos, y: -pin.lat }));
  const xs = raw.map((point) => point.x);
  const ys = raw.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const innerW = Math.max(0, box.width - box.pad * 2);
  const innerH = Math.max(0, box.height - box.pad * 2);
  const span = Math.max(spanX / (innerW || 1), spanY / (innerH || 1));
  const scale = span > 0 ? 1 / span : 0;
  const offsetX = box.pad + (innerW - spanX * scale) / 2;
  const offsetY = box.pad + (innerH - spanY * scale) / 2;
  return raw.map(({ pin, x, y }) => ({
    pin,
    x: scale === 0 ? box.width / 2 : offsetX + (x - minX) * scale,
    y: scale === 0 ? box.height / 2 : offsetY + (y - minY) * scale,
  }));
}
