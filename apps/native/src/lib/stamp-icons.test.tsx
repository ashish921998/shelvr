// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { MapStamp } from "./map-stamps";
import { Skia } from "@shopify/react-native-skia";
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
  const fromURI = vi.fn((uri: string) => {
    last = uri;
    return Promise.resolve(uri);
  });
  return {
    matchFont: vi.fn(),
    Skia: {
      Data: { fromURI },
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

it("reuses the covers it holds instead of loading them again", async () => {
  const { result, rerender } = renderHook(
    ({ stamps }) => useStampCovers(stamps),
    { initialProps: { stamps: [stamp("c")] } },
  );
  await waitFor(() => expect(result.current.has("c")).toBe(true));
  const loads = vi.mocked(Skia.Data.fromURI).mock.calls.length;
  rerender({ stamps: [stamp("c"), stamp("d")] });
  await waitFor(() => expect(result.current.has("d")).toBe(true));
  expect(vi.mocked(Skia.Data.fromURI).mock.calls.slice(loads)).toEqual([["d"]]);
});
