import { analytics } from "@/lib/analytics";
import type { MapStamp, StampGroup } from "@/lib/map-stamps";
import {
  matchFont,
  Skia,
  type SkCanvas,
  type SkImage,
} from "@shopify/react-native-skia";
import { Image, type ImageRef } from "expo-image";
import { useCallback, useEffect, useState } from "react";

export type StampColors = { frame: string; badge: string; onBadge: string };

const SIZE = 50;
const SCALE = 3;
const FRAME = { x: 10, y: 3, width: 28, height: 38 };
const BORDER = 2.5;
const BADGE = { x: 39, y: 41, radius: 8 };

const painted = new Map<string, Promise<ImageRef | null>>();
const decoded = new Map<string, Promise<SkImage | null>>();

export function stampTilt(itemId: string): number {
  let hash = 0;
  for (const char of itemId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 11) - 5;
}

function stampBadge(group: StampGroup): string {
  const count = group.saves.length > 1 ? group.saves.length : group.count;
  return count > 99 ? "99+" : String(count);
}

function drawFrame(canvas: SkCanvas, color: string) {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(color));
  paint.setImageFilter(
    Skia.ImageFilter.MakeDropShadow(0, 1, 1.5, 1.5, Skia.Color("#00000040")),
  );
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(FRAME.x, FRAME.y, FRAME.width, FRAME.height),
      2,
      2,
    ),
    paint,
  );
}

function drawCover(canvas: SkCanvas, cover: SkImage) {
  const width = FRAME.width - BORDER * 2;
  const height = FRAME.height - BORDER * 2;
  const scale = Math.min(cover.width() / width, cover.height() / height);
  const srcWidth = width * scale;
  const srcHeight = height * scale;
  canvas.drawImageRect(
    cover,
    Skia.XYWHRect(
      (cover.width() - srcWidth) / 2,
      (cover.height() - srcHeight) / 2,
      srcWidth,
      srcHeight,
    ),
    Skia.XYWHRect(FRAME.x + BORDER, FRAME.y + BORDER, width, height),
    Skia.Paint(),
  );
}

function drawBadge(canvas: SkCanvas, label: string, colors: StampColors) {
  const ring = Skia.Paint();
  ring.setColor(Skia.Color(colors.frame));
  canvas.drawCircle(BADGE.x, BADGE.y, BADGE.radius, ring);
  const fill = Skia.Paint();
  fill.setColor(Skia.Color(colors.badge));
  canvas.drawCircle(BADGE.x, BADGE.y, BADGE.radius - 1.5, fill);
  const font = matchFont({
    fontFamily: "Helvetica",
    fontSize: label.length > 2 ? 6.5 : 9,
    fontWeight: "bold",
  });
  const text = Skia.Paint();
  text.setColor(Skia.Color(colors.onBadge));
  const box = font.measureText(label);
  canvas.drawText(
    label,
    BADGE.x - box.width / 2 - box.x,
    BADGE.y - box.height / 2 - box.y,
    text,
    font,
  );
}

function decode(uri: string): Promise<SkImage | null> {
  let image = decoded.get(uri);
  if (!image) {
    image = Skia.Data.fromURI(uri)
      .then((data) => Skia.Image.MakeImageFromEncoded(data))
      .catch((error: unknown) => {
        analytics.captureError("map_stamp_cover_failed", error);
        decoded.delete(uri);
        return null;
      });
    decoded.set(uri, image);
  }
  return image;
}

export function useStampCovers(stamps: readonly MapStamp[]) {
  const [covers, setCovers] = useState<ReadonlyMap<string, SkImage>>(
    () => new Map(),
  );
  useEffect(() => {
    let live = true;
    for (const uri of new Set(stamps.map((stamp) => stamp.cover))) {
      void decode(uri).then((image) => {
        if (!live || !image) return;
        setCovers((previous) =>
          previous.get(uri) === image
            ? previous
            : new Map(previous).set(uri, image),
        );
      });
    }
    return () => {
      live = false;
    };
  }, [stamps]);
  return covers;
}

async function paint(
  group: StampGroup,
  cover: SkImage,
  colors: StampColors,
): Promise<ImageRef | null> {
  const surface = Skia.Surface.Make(SIZE * SCALE, SIZE * SCALE);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(SCALE, SCALE);
  const tilt = stampTilt(group.itemId);
  if (group.saves.length > 1) {
    canvas.save();
    canvas.rotate(tilt + 9, SIZE / 2, SIZE / 2);
    drawFrame(canvas, colors.frame);
    canvas.restore();
  }
  canvas.save();
  canvas.rotate(tilt, SIZE / 2, SIZE / 2);
  drawFrame(canvas, colors.frame);
  drawCover(canvas, cover);
  canvas.restore();
  drawBadge(canvas, stampBadge(group), colors);
  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBase64();
  return await Image.loadAsync({ uri: `data:image/png;base64,${png}` });
}

function stampKey(group: StampGroup, colors: StampColors) {
  return [
    group.itemId,
    group.cover,
    stampBadge(group),
    group.saves.length > 1,
    colors.frame,
    colors.badge,
    colors.onBadge,
  ].join("|");
}

export function useStampIcons(
  groups: StampGroup[],
  covers: ReadonlyMap<string, SkImage>,
  colors: StampColors | undefined,
) {
  const [icons, setIcons] = useState<ReadonlyMap<string, ImageRef>>(
    () => new Map(),
  );
  useEffect(() => {
    let live = true;
    if (!colors) return;
    for (const group of groups) {
      const cover = covers.get(group.cover);
      if (!cover) continue;
      const key = stampKey(group, colors);
      if (!painted.has(key))
        painted.set(
          key,
          paint(group, cover, colors).catch((error: unknown) => {
            analytics.captureError("map_stamp_paint_failed", error);
            painted.delete(key);
            return null;
          }),
        );
      void painted.get(key)!.then((icon) => {
        if (!live || !icon) return;
        setIcons((previous) =>
          previous.get(key) === icon
            ? previous
            : new Map(previous).set(key, icon),
        );
      });
    }
    return () => {
      live = false;
    };
  }, [groups, covers, colors]);
  return useCallback(
    (group: StampGroup) =>
      colors ? icons.get(stampKey(group, colors)) : undefined,
    [icons, colors],
  );
}
