// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { MapStamp } from "./map-stamps";
import { useStampCovers } from "./stamp-icons";

vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("expo-image", () => ({ Image: { loadAsync: vi.fn() } }));
vi.mock("@shopify/react-native-skia", () => {
  const image = (uri: string) => ({
    uri,
    width: () => 100,
    height: () => 100,
    makeNonTextureImage() {
      return this;
    },
  });
  let last = "";
  return {
    matchFont: vi.fn(),
    Skia: {
      Data: {
        fromURI: (uri: string) => {
          last = uri;
          return Promise.resolve(uri);
        },
      },
      Image: { MakeImageFromEncoded: vi.fn((uri: string) => image(uri)) },
      XYWHRect: vi.fn(() => ({})),
      Paint: vi.fn(() => ({})),
      Surface: {
        Make: vi.fn(() => ({
          getCanvas: () => ({ drawImageRect: vi.fn() }),
          flush: vi.fn(),
          makeImageSnapshot: () => image(last),
        })),
      },
    },
  };
});

const stamp = (cover: string): MapStamp => ({
  id: cover,
  itemId: cover,
  lat: 0,
  lng: 0,
  cover,
  count: 1,
  places: [],
  pins: [],
  newest: 1,
});

it("drops covers of stamps that leave the map", async () => {
  const { result, rerender } = renderHook(
    ({ stamps }) => useStampCovers(stamps),
    { initialProps: { stamps: [stamp("a"), stamp("b")] } },
  );
  await waitFor(() => expect([...result.current.keys()]).toEqual(["a", "b"]));
  rerender({ stamps: [stamp("b")] });
  expect([...result.current.keys()]).toEqual(["b"]);
  rerender({ stamps: [] });
  expect(result.current.size).toBe(0);
});
