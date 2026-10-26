import { beforeEach, describe, expect, it, vi } from "vitest";
import { canOpenPlaceCard, openPlaceDetails } from "./apple-place-card";

const mocks = vi.hoisted(() => ({
  available: true,
  openPlaceCard: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("../../modules/apple-place-card", () => ({
  placeCardAvailable: () => mocks.available,
  openPlaceCard: mocks.openPlaceCard,
}));
vi.mock("@/lib/analytics", () => ({ analytics: mocks }));

beforeEach(() => {
  mocks.available = true;
  mocks.openPlaceCard.mockReset();
  mocks.captureError.mockReset();
});

describe("canOpenPlaceCard", () => {
  it("needs both an Apple place id and the native card", () => {
    expect(canOpenPlaceCard("I1")).toBe(true);
    expect(canOpenPlaceCard(undefined)).toBe(false);
    mocks.available = false;
    expect(canOpenPlaceCard("I1")).toBe(false);
  });
});

describe("openPlaceDetails", () => {
  it("shows the card for the place and leaves the save closed when dismissed", async () => {
    mocks.openPlaceCard.mockResolvedValue("dismissed");
    const openSave = vi.fn();
    await openPlaceDetails("I1", openSave);
    expect(mocks.openPlaceCard).toHaveBeenCalledWith("I1");
    expect(openSave).not.toHaveBeenCalled();
  });

  it("opens the save when the card cannot be shown", async () => {
    mocks.openPlaceCard.mockResolvedValue("unavailable");
    const openSave = vi.fn();
    await openPlaceDetails("I1", openSave);
    expect(openSave).toHaveBeenCalledOnce();
  });

  it("opens the save when the card throws, and reports it", async () => {
    mocks.openPlaceCard.mockRejectedValue(new Error("boom"));
    const openSave = vi.fn();
    await openPlaceDetails("I1", openSave);
    expect(openSave).toHaveBeenCalledOnce();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "place_card_failed",
      expect.any(Error),
    );
  });

  it("ignores a second tap while a card is open", async () => {
    let finish: (result: string) => void = () => {};
    mocks.openPlaceCard.mockReturnValue(
      new Promise<string>((resolve) => (finish = resolve)),
    );
    const openSave = vi.fn();
    const first = openPlaceDetails("I1", openSave);
    await openPlaceDetails("I1", openSave);
    expect(mocks.openPlaceCard).toHaveBeenCalledOnce();
    finish("dismissed");
    await first;
    await openPlaceDetails("I1", openSave);
    expect(mocks.openPlaceCard).toHaveBeenCalledTimes(2);
  });
});
