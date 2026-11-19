import { analytics } from "@/lib/analytics";
import type { MapStamp, StampGroup } from "@/lib/map-stamps";
import {
  matchFont,
  Skia,
  type SkCanvas,
  type SkImage,
} from "@shopify/react-native-skia";
import { Image, type ImageRef } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";

export type StampColors = { frame: string; badge: string; onBadge: string };

const SIZE = 50;
const SCALE = 3;
const FRAME = { x: 10, y: 3, width: 28, height: 38 };
const BORDER = 2.5;
const BADGE = { x: 39, y: 41, radius: 8 };

const COVER = {
  width: FRAME.width - BORDER * 2,
  height: FRAME.height - BORDER * 2,
};
const MAX_COVERS = 60;
const MAX_ICONS = 120;
const COVER_TIMEOUT_MS = 15_000;

const painted = new Map<string, Promise<ImageRef | null>>();
const decoded = new Map<string, Promise<SkImage | null>>();

function remember<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  max: number,
) {
  cache.delete(key);
  cache.set(key, value);
  for (const oldest of cache.keys()) {
    if (cache.size <= max) break;
    cache.delete(oldest);
  }
}

function prune<T>(
  previous: ReadonlyMap<string, T>,
  wanted: ReadonlySet<string>,
): ReadonlyMap<string, T> {
  return [...previous.keys()].every((known) => wanted.has(known))
    ? previous
    : new Map([...previous].filter(([known]) => wanted.has(known)));
}

function keep<T>(
  previous: ReadonlyMap<string, T>,
  wanted: ReadonlySet<string>,
  key: string,
  value: T,
): ReadonlyMap<string, T> {
  const next = prune(previous, wanted);
  return next.get(key) === value ? next : new Map(next).set(key, value);
}

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

function drawCover(
  canvas: SkCanvas,
  cover: SkImage,
  x = FRAME.x + BORDER,
  y = FRAME.y + BORDER,
  width = COVER.width,
  height = COVER.height,
) {
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
    Skia.XYWHRect(x, y, width, height),
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

function shrink(image: SkImage | null): SkImage | null {
  const width = COVER.width * SCALE;
  const height = COVER.height * SCALE;
  const surface = image && Skia.Surface.Make(width, height);
  if (!surface) return null;
  drawCover(surface.getCanvas(), image, 0, 0, width, height);
  surface.flush();
  return surface.makeImageSnapshot().makeNonTextureImage();
}

function load(uri: string) {
  return new Promise<SkImage | null>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("cover timed out")),
      COVER_TIMEOUT_MS,
    );
    Skia.Data.fromURI(uri)
      .then((data) => resolve(shrink(Skia.Image.MakeImageFromEncoded(data))))
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

function decode(uri: string): Promise<SkImage | null> {
  const cached = decoded.get(uri);
  if (cached) {
    remember(decoded, uri, cached, MAX_COVERS);
    return cached;
  }
  const image = load(uri)
    .catch((error: unknown) => {
      analytics.captureError("map_stamp_cover_failed", error);
      return null;
    })
    .then((result) => {
      if (!result) decoded.delete(uri);
      return result;
    });
  remember(decoded, uri, image, MAX_COVERS);
  return image;
}

export function useStampCovers(stamps: readonly MapStamp[]) {
  const [covers, setCovers] = useState<ReadonlyMap<string, SkImage>>(
    () => new Map(),
  );
  const [seen, setSeen] = useState(stamps);
  if (seen !== stamps) {
    setSeen(stamps);
    setCovers((previous) =>
      prune(previous, new Set(stamps.map((stamp) => stamp.cover))),
    );
  }
  const held = useRef(covers);
  useEffect(() => {
    held.current = covers;
  }, [covers]);
  useEffect(() => {
    let live = true;
    const uris = new Set(stamps.map((stamp) => stamp.cover));
    for (const uri of uris) {
      if (held.current.has(uri)) continue;
      void decode(uri).then((image) => {
        if (!live || !image) return;
        setCovers((previous) => keep(previous, uris, uri, image));
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
  const [seen, setSeen] = useState({ groups, colors });
  if (seen.groups !== groups || seen.colors !== colors) {
    setSeen({ groups, colors });
    setIcons((previous) =>
      prune(
        previous,
        new Set(colors ? groups.map((group) => stampKey(group, colors)) : []),
      ),
    );
  }
  const held = useRef(icons);
  useEffect(() => {
    held.current = icons;
  }, [icons]);
  useEffect(() => {
    let live = true;
    if (!colors) return;
    const keys = new Set(groups.map((group) => stampKey(group, colors)));
    for (const group of groups) {
      const cover = covers.get(group.cover);
      const key = stampKey(group, colors);
      if (!cover || held.current.has(key)) continue;
      const icon =
        painted.get(key) ??
        paint(group, cover, colors)
          .catch((error: unknown) => {
            analytics.captureError("map_stamp_paint_failed", error);
            return null;
          })
          .then((result) => {
            if (!result) painted.delete(key);
            return result;
          });
      remember(painted, key, icon, MAX_ICONS);
      void icon.then((icon) => {
        if (!live || !icon) return;
        setIcons((previous) => keep(previous, keys, key, icon));
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
