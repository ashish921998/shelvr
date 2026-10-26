import { describe, expect, it } from "vitest";
import { planGateOffer } from "./plan-gate";

describe("planGateOffer", () => {
  it("offers the comeback price once Pro has ended, counting saved places", () => {
    expect(
      planGateOffer("lapsed", [{ placeCount: 14 }, { placeCount: 9 }, {}]),
    ).toEqual({ kind: "winback", placement: "winback", places: 23 });
  });

  it("counts no places while the cities are still loading", () => {
    expect(planGateOffer("lapsed", undefined)).toEqual({
      kind: "winback",
      placement: "winback",
      places: 0,
    });
  });

  it("offers the intro price to an account that never had Pro", () => {
    expect(planGateOffer("none", [{ placeCount: 3 }])).toEqual({
      kind: "intro",
      placement: "intro",
    });
  });
});
