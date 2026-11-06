import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { placeKey } from "./plan";
import {
  isPublicMapToken,
  publicCityPlaces,
  publicCityPreviews,
  publicMapCities,
  publicPost,
} from "./publicMap";
import {
  MAX_PUBLIC_MAP_CITIES,
  MAX_PUBLIC_MAP_PLACES_PER_CITY,
  MAX_PUBLIC_MAP_SAVES_PER_CITY,
} from "./publicMapLimits";

type Pin = NonNullable<Doc<"items">["placePins"]>[number];

let next = 0;
function save(fields: Partial<Doc<"items">> = {}): Doc<"items"> {
  next += 1;
  return {
    _id: `item-${next}` as Id<"items">,
    _creationTime: next,
    userId: "user-a",
    type: "link",
    status: "ready",
    tags: [],
    searchText: "",
    ...fields,
  };
}

function pin(
  name: string,
  lat: number,
  lng: number,
  fields: Partial<Pin> = {},
): Pin {
  return { name, lat, lng, ...fields };
}

function cdmx(pins: Pin[], fields: Partial<Doc<"items">> = {}) {
  return save({ cities: ["Mexico City"], placePins: pins, ...fields });
}

const NONE = new Set<string>();
const been = (...names: string[]) => new Set(names.map(placeKey));
const names = (places: { name: string }[]) => places.map((p) => p.name);

describe("isPublicMapToken", () => {
  it("accepts 32 lowercase hex characters only", () => {
    expect(isPublicMapToken("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isPublicMapToken("0123456789ABCDEF0123456789ABCDEF")).toBe(false);
    expect(isPublicMapToken("0123456789abcdef0123456789abcde")).toBe(false);
    expect(isPublicMapToken("0123456789abcdef0123456789abcdef0")).toBe(false);
    expect(isPublicMapToken("0123456789abcdef0123456789abcdeg")).toBe(false);
    expect(isPublicMapToken("")).toBe(false);
    expect(isPublicMapToken("../0123456789abcdef0123456789abcd")).toBe(false);
  });
});

describe("publicPost", () => {
  const link = (url: string) => publicPost({ type: "link", url });

  it("rebuilds an Instagram post from its shortcode, dropping the sharer and the query", () => {
    expect(
      link("https://www.instagram.com/someone/reel/DFixtureMx1/?igsh=c2hlbHZy"),
    ).toEqual({
      site: "instagram",
      url: "https://www.instagram.com/reel/DFixtureMx1/",
    });
    expect(link("https://instagram.com/p/Cabc123/?img_index=2")).toEqual({
      site: "instagram",
      url: "https://www.instagram.com/p/Cabc123/",
    });
    expect(link("https://m.instagram.com/tv/Babc123")).toEqual({
      site: "instagram",
      url: "https://www.instagram.com/tv/Babc123/",
    });
    expect(link("https://www.instagram.com/reels/Cabc123/")).toEqual({
      site: "instagram",
      url: "https://www.instagram.com/reel/Cabc123/",
    });
  });

  it("gives no post for an Instagram share link, which has no shortcode", () => {
    expect(
      link("https://www.instagram.com/share/reel/BAabc123/?igsh=c2hlbHZy"),
    ).toBeUndefined();
  });

  it("rebuilds a full TikTok post URL without its query", () => {
    expect(
      link(
        "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001?is_from_webapp=1&sender_device=pc",
      ),
    ).toEqual({
      site: "tiktok",
      url: "https://www.tiktok.com/@shelvr.fixtures/video/7300000000000000001",
    });
    expect(link("https://m.tiktok.com/@a_b.c/video/123/")).toEqual({
      site: "tiktok",
      url: "https://www.tiktok.com/@a_b.c/video/123",
    });
  });

  it("gives no post for TikTok short links or odd paths", () => {
    expect(link("https://vm.tiktok.com/ZMfixture1/")).toBeUndefined();
    expect(link("https://www.tiktok.com/t/ZTfixture1/")).toBeUndefined();
    expect(
      link("https://www.tiktok.com/@bad-handle/video/123"),
    ).toBeUndefined();
    expect(link("https://www.tiktok.com/@shelvr/photo/123")).toBeUndefined();
    expect(link("https://tiktok.com.evil.com/@a/video/123")).toBeUndefined();
  });

  it("rebuilds a YouTube video as a youtu.be link without si or times", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=fixtureMx01&si=shelvrfixture",
      "https://youtube.com/shorts/fixtureMx01?si=shelvrfixture",
      "https://youtu.be/fixtureMx01?si=shelvrfixture&t=42",
    ]) {
      expect(link(url)).toEqual({
        site: "youtube",
        url: "https://youtu.be/fixtureMx01",
      });
    }
  });

  it("gives no post for other sites", () => {
    expect(link("https://x.com/someone/status/1234567890")).toBeUndefined();
    expect(link("https://www.pinterest.com/pin/1234567890/")).toBeUndefined();
    expect(link("https://maps.app.goo.gl/fixtureList")).toBeUndefined();
    expect(link("https://example.com/best-tacos-in-roma")).toBeUndefined();
    expect(link("not a url")).toBeUndefined();
    expect(publicPost({ type: "link" })).toBeUndefined();
  });

  it("gives no post for a note or a photo, whatever URL it carries", () => {
    const url = "https://www.instagram.com/reel/DFixtureMx1/";
    expect(publicPost({ type: "note", url })).toBeUndefined();
    expect(publicPost({ type: "image", url })).toBeUndefined();
  });
});

describe("publicCityPlaces", () => {
  it("reads only the chosen city, matched by its key", () => {
    const saves = [
      cdmx([pin("Contramar", 19.4192, -99.1663)]),
      save({
        cities: ["Austin"],
        placePins: [pin("Jo's Coffee", 30.2502, -97.7496)],
      }),
    ];
    expect(names(publicCityPlaces(saves, " mexico  city ", NONE))).toEqual([
      "Contramar",
    ]);
    expect(names(publicCityPlaces(saves, "Austin", NONE))).toEqual([
      "Jo's Coffee",
    ]);
    expect(publicCityPlaces(saves, "Lisbon", NONE)).toEqual([]);
    expect(publicCityPlaces(saves, "   ", NONE)).toEqual([]);
  });

  it("leaves out the places of notes and photos", () => {
    const saves = [
      cdmx([pin("Museo Frida Kahlo", 19.3551, -99.1624)], {
        type: "note",
        note: "Frida museum: book tickets ahead.",
      }),
      cdmx([pin("Casa Azul Photo", 19.3552, -99.1625)], { type: "image" }),
      cdmx([pin("Contramar", 19.4192, -99.1663)]),
    ];
    expect(names(publicCityPlaces(saves, "Mexico City", NONE))).toEqual([
      "Contramar",
    ]);
  });

  it("takes only a multi-city save's pins labelled with the city, and unlabelled pins from single-city saves", () => {
    const saves = [
      save({
        cities: ["Mexico City", "Oaxaca"],
        placePins: [
          pin("Contramar", 19.4192, -99.1663, { city: "Mexico City" }),
          pin("Casa Oaxaca", 17.0654, -96.7236, { city: "Oaxaca" }),
          pin("Somewhere Unlabelled", 19.4, -99.1),
        ],
      }),
      cdmx([pin("Taquería Orinoco", 19.418, -99.164)]),
    ];
    expect(names(publicCityPlaces(saves, "Mexico City", NONE))).toEqual([
      "Contramar",
      "Taquería Orinoco",
    ]);
    expect(names(publicCityPlaces(saves, "Oaxaca", NONE))).toEqual([
      "Casa Oaxaca",
    ]);
  });

  it("drops names that look like street addresses or say nothing", () => {
    const saves = [
      cdmx([
        pin("Calle Durango 200", 19.4205, -99.168),
        pin("12 Main Street", 19.4206, -99.1681),
        pin("Coffee Shop", 19.4207, -99.1682),
        pin("123", 19.4208, -99.1683),
        pin("Taquería Orinoco", 19.418, -99.164),
      ]),
    ];
    expect(names(publicCityPlaces(saves, "Mexico City", NONE))).toEqual([
      "Taquería Orinoco",
    ]);
  });

  it("merges one venue across saves, Been there if either was, keeping the newest save's post", () => {
    const newest = cdmx(
      [
        pin("Contramar", 19.4192, -99.1663, { appleId: "apple-contramar" }),
        pin("Panadería Rosetta", 19.4196, -99.1606, { category: "Bakery" }),
      ],
      { url: "https://www.instagram.com/reel/NewestReel/" },
    );
    const older = cdmx(
      [
        pin("Contramar Roma", 19.4199, -99.1669, {
          appleId: "apple-contramar",
        }),
        pin("Panadería Rosetta", 19.4197, -99.1607),
      ],
      { url: "https://www.tiktok.com/@older/video/42" },
    );
    const places = publicCityPlaces(
      [newest, older],
      "Mexico City",
      been("Contramar Roma"),
    );
    expect(places).toEqual([
      {
        name: "Contramar",
        lat: 19.419,
        lng: -99.166,
        went: true,
        post: {
          site: "instagram",
          url: "https://www.instagram.com/reel/NewestReel/",
        },
      },
      {
        name: "Panadería Rosetta",
        lat: 19.42,
        lng: -99.161,
        emoji: "🥐",
        went: false,
        post: {
          site: "instagram",
          url: "https://www.instagram.com/reel/NewestReel/",
        },
      },
    ]);
  });

  it("takes an older save's post when the newest save of the venue has none", () => {
    const article = cdmx([pin("Contramar", 19.4192, -99.1663)], {
      url: "https://example.com/where-to-eat",
    });
    const reel = cdmx([pin("Contramar", 19.4193, -99.1664)], {
      url: "https://www.instagram.com/reel/OlderReel/",
    });
    expect(publicCityPlaces([article, reel], "Mexico City", NONE)).toEqual([
      {
        name: "Contramar",
        lat: 19.419,
        lng: -99.166,
        went: false,
        post: {
          site: "instagram",
          url: "https://www.instagram.com/reel/OlderReel/",
        },
      },
    ]);
  });

  it("puts Been there first, newest save first within each group", () => {
    const saves = [
      cdmx([pin("Café Avellaneda", 19.348, -99.162)]),
      cdmx([pin("Contramar", 19.4192, -99.1663)]),
      cdmx([pin("Panadería Rosetta", 19.4196, -99.1606)]),
      cdmx([pin("Rosetta", 19.4194, -99.1636)]),
      cdmx([pin("Taquería Orinoco", 19.418, -99.164)]),
    ];
    expect(
      names(
        publicCityPlaces(saves, "Mexico City", been("Contramar", "Rosetta")),
      ),
    ).toEqual([
      "Contramar",
      "Rosetta",
      "Café Avellaneda",
      "Panadería Rosetta",
      "Taquería Orinoco",
    ]);
  });

  it(`stops at ${MAX_PUBLIC_MAP_PLACES_PER_CITY} places`, () => {
    const pins = Array.from({ length: 150 }, (_, i) =>
      pin(`Venue ${String.fromCharCode(65 + (i % 26))}${i}`, 19 + i / 100, -99),
    );
    const places = publicCityPlaces([cdmx(pins)], "Mexico City", NONE);
    expect(places).toHaveLength(MAX_PUBLIC_MAP_PLACES_PER_CITY);
    expect(places[0].name).toBe(pins[0].name);
  });

  it(`reads only the newest ${MAX_PUBLIC_MAP_SAVES_PER_CITY} link saves of the city`, () => {
    const placeless = Array.from(
      { length: MAX_PUBLIC_MAP_SAVES_PER_CITY },
      () => cdmx([]),
    );
    const oldest = cdmx([pin("Contramar", 19.4192, -99.1663)]);
    expect(
      publicCityPlaces([...placeless, oldest], "Mexico City", NONE),
    ).toEqual([]);
    expect(
      names(
        publicCityPlaces([...placeless.slice(1), oldest], "Mexico City", NONE),
      ),
    ).toEqual(["Contramar"]);
  });

  it("rounds points to 3 decimals and returns only the public fields", () => {
    const saves = [
      cdmx(
        [
          pin("Contramar", 19.41937, -99.16681, {
            appleId: "apple-1",
            category: "Restaurant",
          }),
          pin("Plain Place", 19.30001, -99.10001),
        ],
        {
          title: "Contramar tuna tostadas",
          tags: ["food"],
          url: "https://example.com/article",
        },
      ),
    ];
    const places = publicCityPlaces(saves, "Mexico City", NONE);
    expect(places).toEqual([
      {
        name: "Contramar",
        lat: 19.419,
        lng: -99.167,
        emoji: "🍽️",
        went: false,
      },
      { name: "Plain Place", lat: 19.3, lng: -99.1, emoji: "🍽️", went: false },
    ]);
    for (const place of places) {
      const keys = Object.keys(place);
      expect(
        keys.filter((key) => key !== "emoji" && key !== "post").sort(),
      ).toEqual(["lat", "lng", "name", "went"]);
      expect(
        keys.every((key) =>
          ["name", "lat", "lng", "emoji", "went", "post"].includes(key),
        ),
      ).toBe(true);
    }
  });

  it("leaves out the emoji when nothing says what the place is", () => {
    expect(
      publicCityPlaces(
        [cdmx([pin("Orinoco", 19.418, -99.164)])],
        "Mexico City",
        NONE,
      ),
    ).toEqual([{ name: "Orinoco", lat: 19.418, lng: -99.164, went: false }]);
  });
});

describe("publicMapCities", () => {
  const saves = [
    cdmx([
      pin("Contramar", 19.4192, -99.1663),
      pin("Taquería Orinoco", 19.418, -99.164),
    ]),
    save({
      cities: ["Austin"],
      placePins: [pin("Jo's Coffee", 30.2502, -97.7496)],
    }),
    save({
      cities: ["Lisbon"],
      placePins: [pin("Belém Tower", 38.6916, -9.216)],
      type: "image",
    }),
    save({
      cities: ["Boston"],
      placePins: [pin("Tatte", 42.36, -71.06)],
    }),
  ];

  it("keeps the page's spelling, drops cities with no public place and sorts by count, then name", () => {
    expect(
      publicMapCities(
        saves,
        ["Lisbon", "Boston", "Austin", "mexico city"],
        NONE,
      ).map(({ city, places }) => [city, places.length]),
    ).toEqual([
      ["mexico city", 2],
      ["Austin", 1],
      ["Boston", 1],
    ]);
  });

  it(`reads at most ${MAX_PUBLIC_MAP_CITIES} cities`, () => {
    const many = Array.from({ length: MAX_PUBLIC_MAP_CITIES + 1 }, (_, i) =>
      save({
        cities: [`City ${String(i).padStart(2, "0")}`],
        placePins: [pin(`Place ${i}`, 10 + i, 10 + i)],
      }),
    );
    const cities = many.map((item) => item.cities![0]);
    const result = publicMapCities(many, cities, NONE);
    expect(result).toHaveLength(MAX_PUBLIC_MAP_CITIES);
    expect(result.map(({ city }) => city)).toEqual(
      cities.slice(0, MAX_PUBLIC_MAP_CITIES),
    );
  });
});

describe("publicCityPreviews", () => {
  it("names each city's public places as the page shows them, most places first", () => {
    const saves = [
      cdmx([
        pin("Contramar", 19.4192, -99.1663),
        pin("Calle Durango 200", 19.4205, -99.168),
      ]),
      cdmx([pin("Museo Frida Kahlo", 19.3551, -99.1624)], { type: "note" }),
      cdmx([pin("Café Avellaneda", 19.348, -99.162)]),
      save({
        cities: ["Austin"],
        placePins: [pin("Jo's Coffee", 30.2502, -97.7496)],
      }),
      save({
        cities: ["Boston"],
        placePins: [pin("Tatte", 42.36, -71.06)],
      }),
      save({
        cities: ["Lisbon"],
        placePins: [pin("Belém Tower", 38.6916, -9.216)],
        type: "image",
      }),
      save({
        cities: ["Oslo"],
        placePins: [pin("Fuglen", 59.9, 10.7)],
        type: "note",
      }),
    ];
    const visited = been("Café Avellaneda");
    const previews = publicCityPreviews(saves, visited);
    expect(previews.map(({ city }) => city)).toEqual([
      "Mexico City",
      "Austin",
      "Boston",
    ]);
    for (const preview of previews) {
      expect(preview.places).toEqual(
        publicCityPlaces(saves, preview.city, visited).map(
          ({ name, went }) => ({ name, went }),
        ),
      );
    }
    expect(previews[0].places).toEqual([
      { name: "Café Avellaneda", went: true },
      { name: "Contramar", went: false },
    ]);
  });
});
