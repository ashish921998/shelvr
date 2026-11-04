import { analytics } from "@/lib/analytics";
import {
  bubbleKey,
  bubbleSignature,
  parseBubbleKey,
  signatureKeys,
  type BubbleRequest,
} from "@/lib/marker-bubbles";
import { Skia, TextAlign, type SkImage } from "@shopify/react-native-skia";
import { Image, type ImageRef } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { Image as NativeImage, PixelRatio } from "react-native";

const BUBBLE_POINTS = 50;
const EMOJI_POINTS = 17;

const BUBBLE_ASSETS = {
  plain: require("../../assets/map/place-bubble.png"),
  selected: require("../../assets/map/place-bubble-selected.png"),
};

const bases = new Map<boolean, Promise<SkImage>>();
const rendered = new Map<string, Promise<ImageRef | null>>();

async function decodeBase(selected: boolean): Promise<SkImage> {
  const asset = selected ? BUBBLE_ASSETS.selected : BUBBLE_ASSETS.plain;
  const uri = NativeImage.resolveAssetSource(asset)?.uri;
  if (!uri) throw new Error("bubble_asset_missing");
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new Error("bubble_decode_failed");
  return image;
}

function baseImage(selected: boolean): Promise<SkImage> {
  let base = bases.get(selected);
  if (!base) {
    base = decodeBase(selected);
    base.catch(() => bases.delete(selected));
    bases.set(selected, base);
  }
  return base;
}

async function renderBubble({
  emoji,
  selected,
}: BubbleRequest): Promise<ImageRef> {
  const base = await baseImage(selected);
  const ratio = PixelRatio.get();
  const size = Math.round(BUBBLE_POINTS * ratio);
  const surface = Skia.Surface.Make(size, size);
  if (!surface) throw new Error("bubble_surface_failed");
  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    base,
    Skia.XYWHRect(0, 0, base.width(), base.height()),
    Skia.XYWHRect(0, 0, size, size),
    Skia.Paint(),
  );
  const paragraph = Skia.ParagraphBuilder.Make({
    textAlign: TextAlign.Center,
    textStyle: { fontSize: EMOJI_POINTS * ratio },
  })
    .addText(emoji)
    .build();
  paragraph.layout(size);
  paragraph.paint(canvas, 0, (size - paragraph.getHeight()) / 2);
  surface.flush();
  const png = surface.makeImageSnapshot().encodeToBase64();
  return Image.loadAsync(`data:image/png;base64,${png}`);
}

function bubbleImage(key: string): Promise<ImageRef | null> {
  let image = rendered.get(key);
  if (!image) {
    image = renderBubble(parseBubbleKey(key)).catch((error: unknown) => {
      analytics.captureError("map_marker_bubble_failed", error);
      rendered.delete(key);
      return null;
    });
    rendered.set(key, image);
  }
  return image;
}

export function useMarkerBubbles(requests: BubbleRequest[]) {
  const signature = bubbleSignature(requests);
  const [images, setImages] = useState<ReadonlyMap<string, ImageRef>>(
    () => new Map(),
  );

  useEffect(() => {
    let live = true;
    for (const key of signatureKeys(signature)) {
      void bubbleImage(key).then((image) => {
        if (!live || !image) return;
        setImages((current) =>
          current.get(key) === image
            ? current
            : new Map(current).set(key, image),
        );
      });
    }
    return () => {
      live = false;
    };
  }, [signature]);

  return useCallback(
    (request: BubbleRequest) => images.get(bubbleKey(request)),
    [images],
  );
}
