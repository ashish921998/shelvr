import type { TextMessageKey } from "@/locales/message-types";

export const SAMPLE_CITY_IDS = [
  "barcelona",
  "lisbon",
  "london",
  "los-angeles",
  "new-york",
  "paris",
  "prague",
  "san-francisco",
  "seoul",
  "tokyo",
  "toronto",
] as const;
export type SampleCityId = (typeof SAMPLE_CITY_IDS)[number];
const DAY_SLOTS = ["morning", "lunch", "afternoon", "dinner"] as const;
export type SampleSlot = (typeof DAY_SLOTS)[number];
export type LatLng = { lat: number; lng: number };
type CityStop = {
  name: string;
  slot: SampleSlot;
  at: LatLng;
  onWater?: boolean;
};
export type SampleDay = { title: TextMessageKey; stops: readonly CityStop[] };
export type SampleSave = {
  name: string;
  source: TextMessageKey;
  places: number;
  picture: "food" | "view" | "place";
};
export type SampleCity = {
  name: TextMessageKey;
  water: readonly (readonly LatLng[])[];
  waterWidth?: number;
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
};

const ON_WATER = true;
const STREAM_WIDTH = 6;

type DayStop = Omit<CityStop, "slot">;

function stop(
  name: string,
  lat: number,
  lng: number,
  onWater = false,
): DayStop {
  return onWater
    ? { name, at: { lat, lng }, onWater }
    : { name, at: { lat, lng } };
}

function day(title: TextMessageKey, stops: readonly DayStop[]): SampleDay {
  return {
    title,
    stops: stops.map((place, index) => ({ ...place, slot: DAY_SLOTS[index] })),
  };
}

function save(
  name: string,
  source: SampleSave["source"],
  places: number,
  picture: SampleSave["picture"],
): SampleSave {
  return { name, source, places, picture };
}

export const SAMPLE_CITIES = {
  barcelona: {
    name: "tripTeaser.cityBarcelona",
    water: [
      [
        { lat: 41.34, lng: 2.14 },
        { lat: 41.352, lng: 2.16 },
        { lat: 41.366, lng: 2.178 },
        { lat: 41.375, lng: 2.19 },
        { lat: 41.386, lng: 2.2 },
        { lat: 41.4, lng: 2.213 },
        { lat: 41.418, lng: 2.228 },
        { lat: 41.432, lng: 2.24 },
      ],
    ],
    saves: [
      save("Where to eat in Barcelona", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Barcelona", "tripTeaser.sourceArticle", 3, "view"),
      save("Catedral de Barcelona", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.barcelonaDayOne", [
        stop("Catedral de Barcelona", 41.3839, 2.1763),
        stop("Bar del Pla", 41.3853, 2.1808),
        stop("Basílica de Santa Maria del Mar", 41.3836, 2.182),
        stop("El Xampanyet", 41.3848, 2.1815),
      ]),
      day("tripTeaser.barcelonaDayTwo", [
        stop("La Sagrada Família", 41.4036, 2.1744),
        stop("Cerveceria Catalana", 41.3924, 2.16),
        stop("Park Güell", 41.4145, 2.1527),
        stop("Berbena", 41.3978, 2.1545),
      ]),
    ],
  },
  lisbon: {
    name: "tripTeaser.cityLisbon",
    water: [
      [
        { lat: 38.69, lng: -9.235 },
        { lat: 38.693, lng: -9.22 },
        { lat: 38.695, lng: -9.205 },
        { lat: 38.6985, lng: -9.185 },
        { lat: 38.7035, lng: -9.165 },
        { lat: 38.7045, lng: -9.145 },
        { lat: 38.7055, lng: -9.136 },
        { lat: 38.71, lng: -9.124 },
        { lat: 38.717, lng: -9.11 },
      ],
    ],
    saves: [
      save("Where to eat in Lisbon", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Lisbon", "tripTeaser.sourceArticle", 3, "view"),
      save("Praça do Comércio", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.lisbonDayOne", [
        stop("Castelo de São Jorge", 38.7139, -9.1334),
        stop("As Bifanas do Afonso", 38.7125, -9.136),
        stop("Praça do Comércio", 38.7075, -9.1364),
        stop("Prado", 38.7102, -9.1345),
      ]),
      day("tripTeaser.lisbonDayTwo", [
        stop("Mosteiro dos Jerónimos", 38.6979, -9.2066),
        stop("Pastéis de Belém", 38.6975, -9.2032),
        stop("Torre de Belém", 38.6916, -9.216, ON_WATER),
        stop("O Frade", 38.699, -9.2047),
      ]),
    ],
  },
  london: {
    name: "tripTeaser.cityLondon",
    water: [
      [
        { lat: 51.486, lng: -0.1245 },
        { lat: 51.496, lng: -0.1235 },
        { lat: 51.501, lng: -0.123 },
        { lat: 51.5075, lng: -0.119 },
        { lat: 51.5105, lng: -0.106 },
        { lat: 51.509, lng: -0.094 },
        { lat: 51.508, lng: -0.087 },
        { lat: 51.5055, lng: -0.0755 },
        { lat: 51.5065, lng: -0.065 },
        { lat: 51.506, lng: -0.05 },
      ],
    ],
    saves: [
      save("Where to eat in London", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in London", "tripTeaser.sourceArticle", 3, "view"),
      save("Tower Bridge", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.londonDayOne", [
        stop("Covent Garden Market", 51.5119, -0.1231),
        stop("Kiln", 51.5115, -0.1362),
        stop("Carnaby Street", 51.5134, -0.1392),
        stop("Andrew Edmunds", 51.5122, -0.1365),
      ]),
      day("tripTeaser.londonDayTwo", [
        stop("Southwark Cathedral", 51.5062, -0.0902),
        stop("Padella", 51.5052, -0.0909),
        stop("Tower Bridge", 51.5055, -0.0754, ON_WATER),
        stop("José Tapas Bar", 51.5011, -0.0808),
      ]),
    ],
  },
  "los-angeles": {
    name: "tripTeaser.cityLosAngeles",
    water: [
      [
        { lat: 33.96, lng: -118.457 },
        { lat: 33.97, lng: -118.466 },
        { lat: 33.985, lng: -118.4745 },
        { lat: 34, lng: -118.488 },
        { lat: 34.009, lng: -118.501 },
        { lat: 34.02, lng: -118.511 },
        { lat: 34.035, lng: -118.53 },
      ],
    ],
    saves: [
      save("Where to eat in Los Angeles", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Los Angeles", "tripTeaser.sourceArticle", 3, "view"),
      save("Griffith Observatory", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.losAngelesDayOne", [
        stop("Griffith Observatory", 34.1183, -118.3003),
        stop("Kismet", 34.1016, -118.2896),
        stop("Hollyhock House", 34.1009, -118.2943),
        stop("All Time", 34.1058, -118.2877),
      ]),
      day("tripTeaser.losAngelesDayTwo", [
        stop("Santa Monica Pier", 34.0086, -118.4986),
        stop("Gjusta", 33.9962, -118.4745),
        stop("Venice Canals", 33.9836, -118.4653),
        stop("Felix Trattoria", 33.9935, -118.4728),
      ]),
    ],
  },
  "new-york": {
    name: "tripTeaser.cityNewYork",
    water: [
      [
        { lat: 40.7005, lng: -74.015 },
        { lat: 40.711, lng: -74.017 },
        { lat: 40.72, lng: -74.014 },
        { lat: 40.733, lng: -74.0115 },
        { lat: 40.748, lng: -74.0085 },
        { lat: 40.76, lng: -74.003 },
      ],
      [
        { lat: 40.695, lng: -74.006 },
        { lat: 40.7, lng: -74.001 },
        { lat: 40.7057, lng: -73.9964 },
        { lat: 40.71, lng: -73.9895 },
        { lat: 40.716, lng: -73.978 },
      ],
    ],
    saves: [
      save("Where to eat in New York", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in New York", "tripTeaser.sourceArticle", 3, "view"),
      save("Washington Square Park", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.newYorkDayOne", [
        stop("The High Line", 40.748, -74.0047),
        stop("Via Carota", 40.7332, -74.0032),
        stop("Washington Square Park", 40.7308, -73.9975),
        stop("L'Artusi", 40.7339, -74.0048),
      ]),
      day("tripTeaser.newYorkDayTwo", [
        stop("Brooklyn Bridge", 40.7057, -73.9964),
        stop("Juliana's", 40.7027, -73.9935),
        stop("Brooklyn Bridge Park", 40.6978, -73.9983),
        stop("Celestine", 40.704, -73.9893),
      ]),
    ],
  },
  paris: {
    name: "tripTeaser.cityParis",
    water: [
      [
        { lat: 48.864, lng: 2.319 },
        { lat: 48.861, lng: 2.33 },
        { lat: 48.8585, lng: 2.338 },
        { lat: 48.8565, lng: 2.345 },
        { lat: 48.853, lng: 2.353 },
        { lat: 48.8495, lng: 2.362 },
        { lat: 48.844, lng: 2.367 },
        { lat: 48.838, lng: 2.376 },
      ],
    ],
    saves: [
      save("Where to eat in Paris", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Paris", "tripTeaser.sourceArticle", 3, "view"),
      save("Place des Vosges", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.parisDayOne", [
        stop("Notre-Dame de Paris", 48.853, 2.3499, ON_WATER),
        stop("Chez Alain Miam Miam", 48.8627, 2.3623),
        stop("Place des Vosges", 48.8556, 2.3655),
        stop("Chez Janou", 48.8566, 2.3668),
      ]),
      day("tripTeaser.parisDayTwo", [
        stop("Panthéon", 48.8462, 2.346),
        stop("Bouillon Racine", 48.8508, 2.3418),
        stop("Jardin du Luxembourg", 48.8462, 2.3372),
        stop("Les Papilles", 48.8447, 2.3415),
      ]),
    ],
  },
  prague: {
    name: "tripTeaser.cityPrague",
    water: [
      [
        { lat: 50.064, lng: 14.409 },
        { lat: 50.073, lng: 14.412 },
        { lat: 50.079, lng: 14.413 },
        { lat: 50.083, lng: 14.412 },
        { lat: 50.0865, lng: 14.4112 },
        { lat: 50.091, lng: 14.415 },
        { lat: 50.096, lng: 14.42 },
        { lat: 50.1, lng: 14.432 },
      ],
    ],
    saves: [
      save("Where to eat in Prague", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Prague", "tripTeaser.sourceArticle", 3, "view"),
      save("Old Town Square", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.pragueDayOne", [
        stop("Old Town Square", 50.0875, 14.4213),
        stop("Grand Café Orient", 50.0869, 14.4276),
        stop("Charles Bridge", 50.0865, 14.4114, ON_WATER),
        stop("Lokál Dlouhááá", 50.0905, 14.4259),
      ]),
      day("tripTeaser.pragueDayTwo", [
        stop("Prague Castle", 50.091, 14.4002),
        stop("Café Savoy", 50.0801, 14.4097),
        stop("Petřín Lookout Tower", 50.0833, 14.3954),
        stop("Terasa U Zlaté studně", 50.0897, 14.4045),
      ]),
    ],
  },
  "san-francisco": {
    name: "tripTeaser.citySanFrancisco",
    water: [
      [
        { lat: 37.807, lng: -122.45 },
        { lat: 37.8085, lng: -122.427 },
        { lat: 37.81, lng: -122.413 },
        { lat: 37.809, lng: -122.406 },
        { lat: 37.802, lng: -122.398 },
        { lat: 37.7955, lng: -122.393 },
        { lat: 37.786, lng: -122.388 },
        { lat: 37.775, lng: -122.386 },
        { lat: 37.76, lng: -122.385 },
      ],
    ],
    saves: [
      save("Where to eat in San Francisco", "tripTeaser.sourceReel", 4, "food"),
      save(
        "Three days in San Francisco",
        "tripTeaser.sourceArticle",
        3,
        "view",
      ),
      save("Lombard Street", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.sanFranciscoDayOne", [
        stop("Mission Dolores Park", 37.7596, -122.4269),
        stop("Tartine Bakery", 37.7615, -122.4241),
        stop("Clarion Alley", 37.7627, -122.4206),
        stop("Foreign Cinema", 37.7562, -122.419),
      ]),
      day("tripTeaser.sanFranciscoDayTwo", [
        stop("Lombard Street", 37.802, -122.4189),
        stop("Swan Oyster Depot", 37.7914, -122.421),
        stop("Coit Tower", 37.8025, -122.4058),
        stop("Cotogna", 37.7972, -122.4036),
      ]),
    ],
  },
  seoul: {
    name: "tripTeaser.citySeoul",
    waterWidth: STREAM_WIDTH,
    water: [
      [
        { lat: 37.53, lng: 126.93 },
        { lat: 37.525, lng: 126.95 },
        { lat: 37.519, lng: 126.97 },
        { lat: 37.515, lng: 126.99 },
        { lat: 37.521, lng: 127.005 },
        { lat: 37.533, lng: 127.02 },
        { lat: 37.541, lng: 127.045 },
      ],
      [
        { lat: 37.5688, lng: 126.978 },
        { lat: 37.569, lng: 126.99 },
        { lat: 37.5695, lng: 127.001 },
        { lat: 37.57, lng: 127.011 },
        { lat: 37.57, lng: 127.025 },
      ],
    ],
    saves: [
      save("Where to eat in Seoul", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Seoul", "tripTeaser.sourceArticle", 3, "view"),
      save("Gyeongbokgung Palace", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.seoulDayOne", [
        stop("Gyeongbokgung Palace", 37.5796, 126.977),
        stop("Tosokchon Samgyetang", 37.5772, 126.9716),
        stop("Bukchon Hanok Village", 37.5826, 126.9833),
        stop("Gaeseong Mandu Koong", 37.5745, 126.9855),
      ]),
      day("tripTeaser.seoulDayTwo", [
        stop("N Seoul Tower", 37.5512, 126.9882),
        stop("Myeongdong Kyoja", 37.5628, 126.9856),
        stop("Dongdaemun Design Plaza", 37.5669, 127.0095),
        stop("Woo Lae Oak", 37.5672, 126.9992),
      ]),
    ],
  },
  tokyo: {
    name: "tripTeaser.cityTokyo",
    water: [
      [
        { lat: 35.67, lng: 139.78 },
        { lat: 35.68, lng: 139.788 },
        { lat: 35.6925, lng: 139.7925 },
        { lat: 35.7, lng: 139.7945 },
        { lat: 35.71, lng: 139.8005 },
        { lat: 35.72, lng: 139.804 },
        { lat: 35.732, lng: 139.81 },
      ],
    ],
    saves: [
      save("Where to eat in Tokyo", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Tokyo", "tripTeaser.sourceArticle", 3, "view"),
      save("Shibuya Scramble Crossing", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.tokyoDayOne", [
        stop("Meiji Jingu", 35.6764, 139.6993),
        stop("Fuunji", 35.6843, 139.6999),
        stop("Shibuya Scramble Crossing", 35.6595, 139.7005),
        stop("Kaikaya by the Sea", 35.6575, 139.6945),
      ]),
      day("tripTeaser.tokyoDayTwo", [
        stop("Senso-ji", 35.7148, 139.7967),
        stop("Daikokuya Tempura", 35.7121, 139.7952),
        stop("Tokyo Skytree", 35.7101, 139.8107),
        stop("Otafuku", 35.718, 139.794),
      ]),
    ],
  },
  toronto: {
    name: "tripTeaser.cityToronto",
    water: [
      [
        { lat: 43.632, lng: -79.425 },
        { lat: 43.6345, lng: -79.41 },
        { lat: 43.637, lng: -79.396 },
        { lat: 43.6385, lng: -79.387 },
        { lat: 43.64, lng: -79.376 },
        { lat: 43.6415, lng: -79.365 },
        { lat: 43.643, lng: -79.35 },
      ],
    ],
    saves: [
      save("Where to eat in Toronto", "tripTeaser.sourceReel", 4, "food"),
      save("Three days in Toronto", "tripTeaser.sourceArticle", 3, "view"),
      save("CN Tower", "tripTeaser.sourcePlace", 1, "place"),
    ],
    days: [
      day("tripTeaser.torontoDayOne", [
        stop("CN Tower", 43.6426, -79.3871),
        stop("Pai Northern Thai Kitchen", 43.6484, -79.3889),
        stop("Hockey Hall of Fame", 43.6469, -79.3772),
        stop("Richmond Station", 43.6515, -79.3792),
      ]),
      day("tripTeaser.torontoDayTwo", [
        stop("Kensington Market", 43.6548, -79.4007),
        stop("Seven Lives Tacos y Mariscos", 43.6544, -79.4005),
        stop("Chinatown", 43.6529, -79.398),
        stop("Grey Gardens", 43.6553, -79.4016),
      ]),
    ],
  },
} as const satisfies Record<SampleCityId, SampleCity>;

export function isSampleCity(value: unknown): value is SampleCityId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SAMPLE_CITIES, value)
  );
}
