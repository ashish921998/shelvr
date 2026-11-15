// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CityStampArt } from "@/components/passport/city-stamp";

type Props = {
  children?: ReactNode;
  maxFontSizeMultiplier?: number;
  numberOfLines?: number;
};

vi.mock("react-native", () => ({
  Pressable: vi.fn(({ children }: Props) => <button>{children}</button>),
  Text: vi.fn(({ children, maxFontSizeMultiplier, numberOfLines }: Props) => (
    <span data-max-scale={maxFontSizeMultiplier} data-lines={numberOfLines}>
      {children}
    </span>
  )),
  View: vi.fn(({ children }: Props) => <div>{children}</div>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/city-stamp-data", () => ({
  cityStampLabel: (city: string) => city,
}));

afterEach(cleanup);

describe("CityStampArt", () => {
  it("keeps its name and country inside the circle at large text", () => {
    render(<CityStampArt name="Lisbon" country="PT" />);
    expect(screen.getByText("Lisbon").getAttribute("data-max-scale")).toBe("1");
    expect(screen.getByText("PT").getAttribute("data-max-scale")).toBe("1");
  });

  it("shrinks a one-word name instead of breaking it across lines", () => {
    render(<CityStampArt name="Austin" country="US" size={84} />);
    expect(screen.getByText("Austin").getAttribute("data-lines")).toBe("1");
  });

  it("lets a two-word name wrap onto a second line", () => {
    render(<CityStampArt name="New York" country="US" />);
    expect(screen.getByText("New York").getAttribute("data-lines")).toBe("2");
  });

  it("drops the country on a small stamp", () => {
    render(<CityStampArt name="Lisbon" country="PT" size={64} />);
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.queryByText("PT")).toBeNull();
  });
});
