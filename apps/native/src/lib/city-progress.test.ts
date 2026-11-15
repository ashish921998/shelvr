import { describe, expect, it } from "vitest";

import { cityPinId, cityPins } from "@/lib/city-pins";
import { cityProgress, progressLine, visitedPinIds } from "@/lib/city-progress";

const pins = cityPins([
  {
    _id: "rome",
    placePins: [
      { name: "Caffé Dante", lat: 41.9, lng: 12.5 },
      { name: "Micho", lat: 41.91, lng: 12.5 },
      { name: "Shake Shack", lat: 41.92, lng: 12.5, appleId: "R-1" },
      { name: "Shake Shack", lat: 41.95, lng: 12.5, appleId: "R-2" },
      { name: "Franklin Barbecue", lat: 41.93, lng: 12.5, appleId: "X" },
    ],
  },
]);
const id = (name: string, appleId?: string) =>
  cityPinId(pins.find((pin) => pin.name === name && pin.appleId === appleId)!);

describe("visitedPinIds", () => {
  it("ticks every place of a name marked without a spot, ignoring case and accents", () => {
    expect(visitedPinIds(pins, [{ key: "caffedante" }])).toEqual(
      new Set([id("Caffé Dante")]),
    );
    expect(visitedPinIds(pins, [{ key: "shakeshack" }])).toEqual(
      new Set([id("Shake Shack", "R-1"), id("Shake Shack", "R-2")]),
    );
  });

  it("ticks only the place a mark was made on", () => {
    expect(
      visitedPinIds(pins, [
        {
          key: "shakeshack",
          spots: [
            { lat: 41.92, lng: 12.5, appleId: "R-1" },
            { lat: 51.5, lng: -0.12, appleId: "L-1" },
          ],
        },
      ]),
    ).toEqual(new Set([id("Shake Shack", "R-1")]));
  });

  it("ticks a venue marked under another name by its Apple id", () => {
    expect(
      visitedPinIds(pins, [
        {
          key: "franklinbbq",
          spots: [{ lat: 41.9301, lng: 12.5, appleId: "X" }],
        },
      ]),
    ).toEqual(new Set([id("Franklin Barbecue", "X")]));
  });

  it("ticks nothing before any mark", () => {
    expect(visitedPinIds(pins, [])).toEqual(new Set());
  });
});

describe("city progress", () => {
  it("counts the ticked places among a city's pins", () => {
    expect(
      cityProgress(pins, new Set([id("Caffé Dante"), id("Micho"), "gone"])),
    ).toEqual({ visited: 2, total: 5 });
  });

  it("writes a line only once something is visited", () => {
    expect(progressLine({ visited: 0, total: 5 })).toBeNull();
    expect(progressLine({ visited: 0, total: 0 })).toBeNull();
    expect(progressLine({ visited: 1, total: 1 })).toBe("1 of 1 place visited");
    expect(progressLine({ visited: 9, total: 4 })).toBe(
      "4 of 4 places visited",
    );
  });
});
