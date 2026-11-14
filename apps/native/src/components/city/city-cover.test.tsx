// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { CityCover } from "./city-cover";

const images = vi.hoisted(
  () => [] as { source: unknown; onError?: () => void }[],
);

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFill: {},
  },
  useUnistyles: () => ({ theme: { colors: { muted: "m", primaryText: "p" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("expo-image", () => ({
  Image: vi.fn((props: { source: unknown; onError?: () => void }) => {
    images.push(props);
    return <img data-testid="photo" alt="" />;
  }),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => (
    <i data-testid={name} />
  )),
}));
vi.mock("@/lib/city-picture", () => ({
  curatedCityPicture: (city: string) => (city === "Paris" ? 42 : undefined),
}));
const captureError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ analytics: { captureError } }));
vi.mock("@/lib/home-places", () => ({ cityCountLine: () => null }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

const city = (name: string, cover: string | null) => ({
  city: name,
  count: 1,
  placeCount: 2,
  cover,
});

it("shows the curated photo of a known city over the server's cover", () => {
  images.length = 0;
  render(
    <CityCover entry={city("Paris", "https://x/save.jpg")} layout="pair" />,
  );
  expect(images.at(-1)?.source).toBe(42);
});

it("shows the server's city photo for any other city", () => {
  images.length = 0;
  render(
    <CityCover entry={city("Kyoto", "https://x/kyoto.jpg")} layout="wide" />,
  );
  expect(images.at(-1)?.source).toEqual({ uri: "https://x/kyoto.jpg" });
});

it("falls back to the pin card when the photo fails to load", () => {
  images.length = 0;
  render(
    <CityCover entry={city("Kyoto", "https://x/gone.jpg")} layout="pair" />,
  );
  act(() => images.at(-1)?.onError?.());
  expect(screen.queryByTestId("photo")).toBeNull();
  expect(screen.getByTestId("mappin")).toBeTruthy();
  expect(captureError).toHaveBeenCalledWith(
    "city_cover_image_failed",
    expect.any(Error),
    { curated: false },
  );
});

it("falls back from a failed curated photo to the server's cover", () => {
  images.length = 0;
  render(
    <CityCover entry={city("Paris", "https://x/paris.jpg")} layout="pair" />,
  );
  act(() => images.at(-1)?.onError?.());
  expect(images.at(-1)?.source).toEqual({ uri: "https://x/paris.jpg" });
  act(() => images.at(-1)?.onError?.());
  expect(screen.getByTestId("mappin")).toBeTruthy();
});

it("shows a cover the person picked over the curated photo", () => {
  images.length = 0;
  render(
    <CityCover
      entry={{ ...city("Paris", "https://x/mine.jpg"), coverItemId: "s1" }}
      layout="pair"
    />,
  );
  expect(images.at(-1)?.source).toEqual({ uri: "https://x/mine.jpg" });
  act(() => images.at(-1)?.onError?.());
  expect(images.at(-1)?.source).toBe(42);
});

it("draws the pin card for a city with no photo", () => {
  render(<CityCover entry={city("Kyoto", null)} layout="only" />);
  expect(screen.queryByTestId("photo")).toBeNull();
  expect(screen.getByTestId("mappin")).toBeTruthy();
});
