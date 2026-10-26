// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GooglePlaceCard } from "../../modules/place-card";

const mocks = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: mocks }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => ({ configured: true }),
  requireNativeView:
    () =>
    ({
      style,
      onStatus,
      onHeight,
    }: {
      style: { height: number; opacity: number };
      onStatus: (event: { nativeEvent: { status: string } }) => void;
      onHeight: (event: { nativeEvent: { height: number } }) => void;
    }) => (
      <div data-testid="card" style={style}>
        <button onClick={() => onStatus({ nativeEvent: { status: "ready" } })}>
          Ready
        </button>
        <button
          onClick={() => onStatus({ nativeEvent: { status: "unavailable" } })}
        >
          Unavailable
        </button>
        <button onClick={() => onHeight({ nativeEvent: { height: 180 } })}>
          Resize
        </button>
        <button onClick={() => onHeight({ nativeEvent: { height: -1 } })}>
          Bad height
        </button>
      </div>
    ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("shows the card only after its real place details load, using its measured height", () => {
  render(
    <GooglePlaceCard
      placeName="Jos Coffee"
      latitude={30.25}
      longitude={-97.75}
    />,
  );
  expect(screen.getByTestId("card").style.opacity).toBe("0");
  fireEvent.click(screen.getByText("Resize"));
  fireEvent.click(screen.getByText("Ready"));
  expect(screen.getByTestId("card").style.opacity).toBe("1");
  expect(screen.getByTestId("card").style.height).toBe("180px");
  fireEvent.click(screen.getByText("Bad height"));
  expect(screen.getByTestId("card").style.height).toBe("180px");
});

it("removes failed or unmatched cards and reports a sanitized failure", () => {
  render(
    <GooglePlaceCard
      placeName="Jos Coffee"
      latitude={30.25}
      longitude={-97.75}
    />,
  );
  fireEvent.click(screen.getByText("Unavailable"));
  expect(screen.queryByTestId("card")).toBeNull();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "place_card_unavailable",
    new Error("Place card unavailable"),
  );
});
