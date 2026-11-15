// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PassportStoryCard } from "@/components/passport/passport-story-card";
import type { Stamp } from "@/lib/passport";
import type { PassportStory } from "@/lib/passport-story";

type Props = { children?: ReactNode; testID?: string };

vi.mock("react-native", () => ({
  Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  View: vi.fn(({ children, testID }: Props) => (
    <div data-testid={testID}>{children}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/passport/stamp-sheet", () => ({
  StampArt: vi.fn(({ cover }: { cover: string | null }) => (
    <i data-testid={`place-${cover}`} />
  )),
}));
vi.mock("@/components/passport/city-stamp", () => ({
  CityStampArt: vi.fn(({ name }: { name: string }) => (
    <i data-testid={`city-${name}`} />
  )),
}));

afterEach(cleanup);

const story: PassportStory = {
  places: 38,
  cities: 6,
  countries: 3,
  fromReels: true,
  cityStamps: [{ name: "Lisbon", country: "PORTUGAL" }],
  photos: [
    {
      key: "a",
      name: "Pastéis",
      visitedAt: 1,
      cover: "a.jpg",
      city: "Lisbon",
    } as Stamp,
  ],
  more: 37,
};

function renderCard(overrides: Partial<PassportStory> = {}, together = 0) {
  render(
    <PassportStoryCard
      story={{ ...story, ...overrides }}
      together={together}
      link="https://shelvr.app/passport/abc"
      year="2026"
      width={360}
    />,
  );
}

describe("PassportStoryCard", () => {
  it("shows the reels headline, counts, stamps, more and a QR code", () => {
    renderCard();
    expect(
      screen.getByText("I went to 38 places I saved from reels."),
    ).toBeTruthy();
    expect(screen.getByText("Countries")).toBeTruthy();
    expect(screen.getByTestId("city-Lisbon")).toBeTruthy();
    expect(screen.getByTestId("place-a.jpg")).toBeTruthy();
    expect(screen.getByText("+37")).toBeTruthy();
    expect(screen.getByTestId("qr-code")).toBeTruthy();
    expect(screen.queryByTestId("passport-story-together")).toBeNull();
  });

  it("falls back to saved, drops countries when unknown and shows together", () => {
    renderCard({ fromReels: false, countries: null, more: 0 }, 12);
    expect(screen.getByText("I went to 38 places I saved.")).toBeTruthy();
    expect(screen.queryByText("Countries")).toBeNull();
    expect(screen.queryByText("+0")).toBeNull();
    expect(screen.getByText("12 stamped together with friends")).toBeTruthy();
  });
});
