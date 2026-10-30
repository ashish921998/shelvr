import { describe, expect, it } from "vitest";
import {
  REVEAL_MAX_WAIT_MS,
  REVEAL_PIN_GRACE_MS,
  revealFor,
  type RevealSave,
} from "@/lib/spots-reveal";

const pin = (name: string, city?: string) => ({
  name,
  lat: 30.27,
  lng: -97.74,
  ...(city ? { city } : {}),
});

const save = (over: Partial<RevealSave> = {}): RevealSave => ({
  _id: "item-1",
  status: "processing",
  ...over,
});

describe("revealFor", () => {
  it("keeps finding while the save loads or reads", () => {
    expect(revealFor(undefined, 1_000, 0)).toEqual({ kind: "finding" });
    expect(revealFor(save(), 5_000, 0)).toEqual({ kind: "finding" });
  });

  it("drops the spots in the city most pins share", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Austin", "Dallas"],
        placePins: [
          pin("Odd Duck", "Austin"),
          pin("Uchi", "austin"),
          pin("Pecan Lodge", "Dallas"),
          pin("Loro"),
        ],
      }),
      7_000,
      1_000,
    );
    expect(reveal).toEqual({
      kind: "spots",
      city: "Austin",
      pins: [pin("Odd Duck", "Austin"), pin("Uchi", "austin")],
    });
  });

  it("leaves out bare street addresses pinned on top of named spots", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Austin"],
        placePins: [
          pin("Craft Omakase", "Austin"),
          pin("4400 N Lamar Blvd Suite 102, Austin, TX 78756", "Austin"),
        ],
      }),
      7_000,
      0,
    );
    expect(reveal).toEqual({
      kind: "spots",
      city: "Austin",
      pins: [pin("Craft Omakase", "Austin")],
    });
  });

  it("keeps unlabelled pins out of a multi-city save, as the city page does", () => {
    const multi = save({
      cities: ["Austin", "Dallas"],
      status: "ready",
      placePins: [pin("Loro"), pin("Uchi")],
    });
    expect(revealFor(multi, 7_000, 1_000)).toEqual({ kind: "finding" });
  });

  it("waits for a pinned list save to settle before dropping its spots", () => {
    const pinned = save({
      cities: ["Austin"],
      placePins: [pin("Uchi", "Austin")],
    });
    expect(revealFor(pinned, 3_000, 0)).toEqual({ kind: "finding" });
  });

  it("never shows a save whose only pins are street addresses", () => {
    const addresses = save({
      status: "ready",
      cities: ["Austin"],
      placePins: [pin("3108 Windsor Road, Austin, TX 78703", "Austin")],
    });
    expect(revealFor(addresses, 20_000, REVEAL_PIN_GRACE_MS)).toEqual({
      kind: "none",
      reason: "no_place",
    });
  });

  it("names the save's own city when its pins carry none", () => {
    const reveal = revealFor(
      save({
        status: "ready",
        cities: ["Chicago"],
        placePins: [pin("Au Cheval")],
      }),
      7_000,
      0,
    );
    expect(reveal).toMatchObject({ kind: "spots", city: "Chicago" });
  });

  it("waits a short grace for pins after a ready save with a city", () => {
    const ready = save({ status: "ready", cities: ["Austin"] });
    expect(revealFor(ready, 8_000, REVEAL_PIN_GRACE_MS - 1)).toEqual({
      kind: "finding",
    });
    expect(revealFor(ready, 16_000, REVEAL_PIN_GRACE_MS)).toEqual({
      kind: "none",
      reason: "no_place",
    });
  });

  it("goes Home at once when the save has no place or failed", () => {
    expect(revealFor(save({ status: "ready", cities: [] }), 6_000, 0)).toEqual({
      kind: "none",
      reason: "no_place",
    });
    expect(revealFor(save({ status: "failed" }), 3_000, 0)).toEqual({
      kind: "none",
      reason: "failed",
    });
    expect(revealFor(null, 0, 0)).toEqual({ kind: "none", reason: "missing" });
  });

  it("gives up after the longest wait", () => {
    expect(revealFor(save(), REVEAL_MAX_WAIT_MS, 0)).toEqual({
      kind: "none",
      reason: "timeout",
    });
  });
});
