import { expect, it, vi } from "vitest";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/haptics", () => ({ haptics: {} }));
vi.mock("react-native", () => ({ Alert: {} }));
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));

const { coverChoices } = await import("./city-cover-pick");

const save = {
  _id: "s1" as never,
  cities: ["kyoto", "Osaka", "Kyoto"],
  heroImageUrl: "https://cdn/temple.jpg",
};

it("offers each of the save's cities once, with the city's own spelling", () => {
  expect(
    coverChoices(save, [
      { city: "Kyoto", coverItemId: "s1" as never },
      { city: "Osaka", coverItemId: "s2" as never },
    ]),
  ).toEqual([
    { city: "Kyoto", picked: true },
    { city: "Osaka", picked: false },
  ]);
});

it("offers nothing for a save with no photo or before the cities load", () => {
  expect(
    coverChoices({ ...save, heroImageUrl: undefined, imageUrl: null }, [
      { city: "Kyoto" },
    ]),
  ).toEqual([]);
  expect(coverChoices(save, undefined)).toEqual([]);
});
