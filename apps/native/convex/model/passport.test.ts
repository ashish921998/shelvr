import { describe, expect, it } from "vitest";
import {
  comparePassports,
  groupByCity,
  passportCounts,
  placesOnSave,
  samePassportPlace,
} from "./passport";

const PORTO = { lat: 41.14961, lng: -8.61099 };
const PORTO_FAR = { lat: 41.16, lng: -8.63 };

describe("samePassportPlace", () => {
  it("needs the same city, then matches by place when both have a point", () => {
    const majestic = { name: "Majestic", city: "Porto", ...PORTO };
    expect(
      samePassportPlace(majestic, {
        name: "Majestic Café",
        city: "porto",
        ...PORTO,
      }),
    ).toBe(true);
    expect(
      samePassportPlace(majestic, {
        name: "Majestic",
        city: "Porto",
        ...PORTO_FAR,
      }),
    ).toBe(false);
    expect(
      samePassportPlace(majestic, {
        name: "Majestic",
        city: "Lisbon",
        ...PORTO,
      }),
    ).toBe(false);
  });

  it("falls back to the name when either side has no point", () => {
    expect(
      samePassportPlace(
        { name: "Majestic", city: "Porto", ...PORTO },
        { name: "majestic", city: "Porto" },
      ),
    ).toBe(true);
  });
});

describe("comparePassports", () => {
  it("keeps branches apart in Compare, and saves one per name and city", () => {
    const theirs = [
      { name: "Majestic", city: "Porto", ...PORTO },
      { name: "Majestic", city: "Porto", ...PORTO_FAR },
      { name: "Nowhere" },
      { name: "Bar Alto", city: "Lisbon" },
    ];
    const result = comparePassports([], theirs, [
      { name: "Bar Alto", city: "Lisbon", lat: 38.72, lng: -9.14 },
    ]);
    expect(result.onlyThem).toEqual([
      { name: "Majestic", city: "Porto" },
      { name: "Majestic", city: "Porto" },
      { name: "Nowhere" },
      { name: "Bar Alto", city: "Lisbon" },
    ]);
    expect(result.toSave).toEqual([{ name: "Majestic", city: "Porto" }]);
  });

  it("does not save a place you saved under a longer name at the same spot", () => {
    const spot = { lat: 38.72, lng: -9.14 };
    const result = comparePassports(
      [],
      [{ name: "Santa Joana", city: "Lisbon", ...spot }],
      [{ name: "Locke de Santa Joana", city: "Lisbon", ...spot }],
    );
    expect(result.onlyThem).toEqual([{ name: "Santa Joana", city: "Lisbon" }]);
    expect(result.toSave).toEqual([]);
  });
});

describe("placesOnSave", () => {
  it("counts names only on a one-city save, and a pin by its own city", () => {
    const pin = { name: "Majestic", city: "Porto", ...PORTO };
    expect(
      placesOnSave({
        cities: ["Porto", "Lisbon"],
        places: ["Bar Alto"],
        placePins: [pin, { name: "Nowhere", ...PORTO }],
      }),
    ).toEqual([pin]);
    expect(placesOnSave({ cities: ["Porto"], places: ["Majestic"] })).toEqual([
      { name: "Majestic", city: "Porto" },
    ]);
  });
});

describe("groupByCity", () => {
  it("groups by city key in first-seen order and puts no city last", () => {
    const groups = groupByCity([
      { name: "a" },
      { name: "b", city: "Lisbon" },
      { name: "c", city: "lisbon " },
      { name: "d", city: "Porto" },
    ]);
    expect(groups.map((group) => [group.city, group.items.length])).toEqual([
      ["Lisbon", 2],
      ["Porto", 1],
      [null, 1],
    ]);
  });
});

describe("passportCounts", () => {
  it("counts cities by key and hides countries until one is known", () => {
    expect(
      passportCounts([{ city: "Lisbon" }, { city: "lisbon " }, {}]),
    ).toEqual({ places: 3, cities: 1, countries: null });
    expect(
      passportCounts([
        { city: "Lisbon", countryCode: "PT" },
        { city: "Paris", countryCode: "FR" },
        { city: "Porto", countryCode: "PT" },
      ]),
    ).toEqual({ places: 3, cities: 3, countries: 2 });
  });
});
