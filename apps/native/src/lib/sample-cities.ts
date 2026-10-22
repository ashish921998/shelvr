import type { TextMessageKey } from "@/locales/message-types";

// Every city the onboarding sample trip can be in. Place names are the
// places' own and stay untranslated; coordinates are approximate and only
// place pins on a drawn map.

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
export type SampleSlot = "morning" | "lunch" | "afternoon" | "dinner";
export type LatLng = { lat: number; lng: number };
type SampleStop = {
  name: string;
  slot: SampleSlot;
  at: LatLng;
  /** The place really is on the water (a bridge, an island), so its pin may
   * sit on the drawn river. */
  onWater?: boolean;
};
export type SampleDay = { title: TextMessageKey; stops: readonly SampleStop[] };
export type SampleSave = {
  name: string;
  /** The page's own host, or a label that says what kind of save it is. */
  source: { host: string } | { label: TextMessageKey };
  /** How many of the trip's places this save names. */
  places: number;
  /** Which cover the save shows: the city's dish photo, its view photo, or none. */
  picture: "food" | "view" | "place";
};
export type SampleCity = {
  /** The city's name as people say it in their language. */
  name: TextMessageKey;
  /** Rivers, canals and shorelines near the stops, each a line of points. */
  water: readonly (readonly LatLng[])[];
  /** How wide the water is drawn, for a narrow stream; a river otherwise. */
  waterWidth?: number;
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
};

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
      {
        name: "Where to eat in Barcelona",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Barcelona",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Catedral de Barcelona",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.barcelonaDayOne",
        stops: [
          {
            name: "Catedral de Barcelona",
            slot: "morning",
            at: { lat: 41.3839, lng: 2.1763 },
          },
          {
            name: "Bar del Pla",
            slot: "lunch",
            at: { lat: 41.3853, lng: 2.1808 },
          },
          {
            name: "Basílica de Santa Maria del Mar",
            slot: "afternoon",
            at: { lat: 41.3836, lng: 2.182 },
          },
          {
            name: "El Xampanyet",
            slot: "dinner",
            at: { lat: 41.3848, lng: 2.1815 },
          },
        ],
      },
      {
        title: "tripTeaser.barcelonaDayTwo",
        stops: [
          {
            name: "La Sagrada Família",
            slot: "morning",
            at: { lat: 41.4036, lng: 2.1744 },
          },
          {
            name: "Cerveceria Catalana",
            slot: "lunch",
            at: { lat: 41.3924, lng: 2.16 },
          },
          {
            name: "Park Güell",
            slot: "afternoon",
            at: { lat: 41.4145, lng: 2.1527 },
          },
          {
            name: "Berbena",
            slot: "dinner",
            at: { lat: 41.3978, lng: 2.1545 },
          },
        ],
      },
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
      {
        name: "Where to eat in Lisbon",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Lisbon",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Praça do Comércio",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.lisbonDayOne",
        stops: [
          {
            name: "Castelo de São Jorge",
            slot: "morning",
            at: { lat: 38.7139, lng: -9.1334 },
          },
          {
            name: "As Bifanas do Afonso",
            slot: "lunch",
            at: { lat: 38.7125, lng: -9.136 },
          },
          {
            name: "Praça do Comércio",
            slot: "afternoon",
            at: { lat: 38.7075, lng: -9.1364 },
          },
          { name: "Prado", slot: "dinner", at: { lat: 38.7102, lng: -9.1345 } },
        ],
      },
      {
        title: "tripTeaser.lisbonDayTwo",
        stops: [
          {
            name: "Mosteiro dos Jerónimos",
            slot: "morning",
            at: { lat: 38.6979, lng: -9.2066 },
          },
          {
            name: "Pastéis de Belém",
            slot: "lunch",
            at: { lat: 38.6975, lng: -9.2032 },
          },
          {
            name: "Torre de Belém",
            slot: "afternoon",
            at: { lat: 38.6916, lng: -9.216 },
            // The tower stands in the Tagus, off the bank.
            onWater: true,
          },
          {
            name: "O Frade",
            slot: "dinner",
            at: { lat: 38.699, lng: -9.2047 },
          },
        ],
      },
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
      {
        name: "Where to eat in London",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in London",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Tower Bridge",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.londonDayOne",
        stops: [
          {
            name: "Covent Garden Market",
            slot: "morning",
            at: { lat: 51.5119, lng: -0.1231 },
          },
          { name: "Kiln", slot: "lunch", at: { lat: 51.5115, lng: -0.1362 } },
          {
            name: "Carnaby Street",
            slot: "afternoon",
            at: { lat: 51.5134, lng: -0.1392 },
          },
          {
            name: "Andrew Edmunds",
            slot: "dinner",
            at: { lat: 51.5122, lng: -0.1365 },
          },
        ],
      },
      {
        title: "tripTeaser.londonDayTwo",
        stops: [
          {
            name: "Southwark Cathedral",
            slot: "morning",
            at: { lat: 51.5062, lng: -0.0902 },
          },
          {
            name: "Padella",
            slot: "lunch",
            at: { lat: 51.5052, lng: -0.0909 },
          },
          {
            name: "Tower Bridge",
            slot: "afternoon",
            at: { lat: 51.5055, lng: -0.0754 },
            onWater: true,
          },
          {
            name: "José Tapas Bar",
            slot: "dinner",
            at: { lat: 51.5011, lng: -0.0808 },
          },
        ],
      },
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
      {
        name: "Where to eat in Los Angeles",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Los Angeles",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Griffith Observatory",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.losAngelesDayOne",
        stops: [
          {
            name: "Griffith Observatory",
            slot: "morning",
            at: { lat: 34.1183, lng: -118.3003 },
          },
          {
            name: "Kismet",
            slot: "lunch",
            at: { lat: 34.1016, lng: -118.2896 },
          },
          {
            name: "Hollyhock House",
            slot: "afternoon",
            at: { lat: 34.1009, lng: -118.2943 },
          },
          {
            name: "All Time",
            slot: "dinner",
            at: { lat: 34.1058, lng: -118.2877 },
          },
        ],
      },
      {
        title: "tripTeaser.losAngelesDayTwo",
        stops: [
          {
            name: "Santa Monica Pier",
            slot: "morning",
            at: { lat: 34.0086, lng: -118.4986 },
          },
          {
            name: "Gjusta",
            slot: "lunch",
            at: { lat: 33.9962, lng: -118.4745 },
          },
          {
            name: "Venice Canals",
            slot: "afternoon",
            at: { lat: 33.9836, lng: -118.4653 },
          },
          {
            name: "Felix Trattoria",
            slot: "dinner",
            at: { lat: 33.9935, lng: -118.4728 },
          },
        ],
      },
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
      {
        name: "Where to eat in New York",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in New York",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Washington Square Park",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.newYorkDayOne",
        stops: [
          {
            name: "The High Line",
            slot: "morning",
            at: { lat: 40.748, lng: -74.0047 },
          },
          {
            name: "Via Carota",
            slot: "lunch",
            at: { lat: 40.7332, lng: -74.0032 },
          },
          {
            name: "Washington Square Park",
            slot: "afternoon",
            at: { lat: 40.7308, lng: -73.9975 },
          },
          {
            name: "L'Artusi",
            slot: "dinner",
            at: { lat: 40.7339, lng: -74.0048 },
          },
        ],
      },
      {
        title: "tripTeaser.newYorkDayTwo",
        stops: [
          {
            name: "Brooklyn Bridge",
            slot: "morning",
            at: { lat: 40.7057, lng: -73.9964 },
          },
          {
            name: "Juliana's",
            slot: "lunch",
            at: { lat: 40.7027, lng: -73.9935 },
          },
          {
            name: "Brooklyn Bridge Park",
            slot: "afternoon",
            at: { lat: 40.6978, lng: -73.9983 },
          },
          {
            name: "Celestine",
            slot: "dinner",
            at: { lat: 40.704, lng: -73.9893 },
          },
        ],
      },
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
      {
        name: "Where to eat in Paris",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Paris",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Place des Vosges",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.parisDayOne",
        stops: [
          {
            name: "Notre-Dame de Paris",
            slot: "morning",
            at: { lat: 48.853, lng: 2.3499 },
            onWater: true,
          },
          {
            name: "Chez Alain Miam Miam",
            slot: "lunch",
            at: { lat: 48.8627, lng: 2.3623 },
          },
          {
            name: "Place des Vosges",
            slot: "afternoon",
            at: { lat: 48.8556, lng: 2.3655 },
          },
          {
            name: "Chez Janou",
            slot: "dinner",
            at: { lat: 48.8566, lng: 2.3668 },
          },
        ],
      },
      {
        title: "tripTeaser.parisDayTwo",
        stops: [
          {
            name: "Panthéon",
            slot: "morning",
            at: { lat: 48.8462, lng: 2.346 },
          },
          {
            name: "Bouillon Racine",
            slot: "lunch",
            at: { lat: 48.8508, lng: 2.3418 },
          },
          {
            name: "Jardin du Luxembourg",
            slot: "afternoon",
            at: { lat: 48.8462, lng: 2.3372 },
          },
          {
            name: "Les Papilles",
            slot: "dinner",
            at: { lat: 48.8447, lng: 2.3415 },
          },
        ],
      },
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
      {
        name: "Where to eat in Prague",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Prague",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Old Town Square",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.pragueDayOne",
        stops: [
          {
            name: "Old Town Square",
            slot: "morning",
            at: { lat: 50.0875, lng: 14.4213 },
          },
          {
            name: "Grand Café Orient",
            slot: "lunch",
            at: { lat: 50.0869, lng: 14.4276 },
          },
          {
            name: "Charles Bridge",
            slot: "afternoon",
            at: { lat: 50.0865, lng: 14.4114 },
            onWater: true,
          },
          {
            name: "Lokál Dlouhááá",
            slot: "dinner",
            at: { lat: 50.0905, lng: 14.4259 },
          },
        ],
      },
      {
        title: "tripTeaser.pragueDayTwo",
        stops: [
          {
            name: "Prague Castle",
            slot: "morning",
            at: { lat: 50.091, lng: 14.4002 },
          },
          {
            name: "Café Savoy",
            slot: "lunch",
            at: { lat: 50.0801, lng: 14.4097 },
          },
          {
            name: "Petřín Lookout Tower",
            slot: "afternoon",
            at: { lat: 50.0833, lng: 14.3954 },
          },
          {
            name: "Terasa U Zlaté studně",
            slot: "dinner",
            at: { lat: 50.0897, lng: 14.4045 },
          },
        ],
      },
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
      {
        name: "Where to eat in San Francisco",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in San Francisco",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Lombard Street",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.sanFranciscoDayOne",
        stops: [
          {
            name: "Mission Dolores Park",
            slot: "morning",
            at: { lat: 37.7596, lng: -122.4269 },
          },
          {
            name: "Tartine Bakery",
            slot: "lunch",
            at: { lat: 37.7615, lng: -122.4241 },
          },
          {
            name: "Clarion Alley",
            slot: "afternoon",
            at: { lat: 37.7627, lng: -122.4206 },
          },
          {
            name: "Foreign Cinema",
            slot: "dinner",
            at: { lat: 37.7562, lng: -122.419 },
          },
        ],
      },
      {
        title: "tripTeaser.sanFranciscoDayTwo",
        stops: [
          {
            name: "Lombard Street",
            slot: "morning",
            at: { lat: 37.802, lng: -122.4189 },
          },
          {
            name: "Swan Oyster Depot",
            slot: "lunch",
            at: { lat: 37.7914, lng: -122.421 },
          },
          {
            name: "Coit Tower",
            slot: "afternoon",
            at: { lat: 37.8025, lng: -122.4058 },
          },
          {
            name: "Cotogna",
            slot: "dinner",
            at: { lat: 37.7972, lng: -122.4036 },
          },
        ],
      },
    ],
  },
  seoul: {
    name: "tripTeaser.citySeoul",
    // Cheonggyecheon is a narrow stream, not a river.
    waterWidth: 6,
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
      {
        name: "Where to eat in Seoul",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Seoul",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Gyeongbokgung Palace",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.seoulDayOne",
        stops: [
          {
            name: "Gyeongbokgung Palace",
            slot: "morning",
            at: { lat: 37.5796, lng: 126.977 },
          },
          {
            name: "Tosokchon Samgyetang",
            slot: "lunch",
            at: { lat: 37.5772, lng: 126.9716 },
          },
          {
            name: "Bukchon Hanok Village",
            slot: "afternoon",
            at: { lat: 37.5826, lng: 126.9833 },
          },
          {
            name: "Gaeseong Mandu Koong",
            slot: "dinner",
            at: { lat: 37.5745, lng: 126.9855 },
          },
        ],
      },
      {
        title: "tripTeaser.seoulDayTwo",
        stops: [
          {
            name: "N Seoul Tower",
            slot: "morning",
            at: { lat: 37.5512, lng: 126.9882 },
          },
          {
            name: "Myeongdong Kyoja",
            slot: "lunch",
            at: { lat: 37.5628, lng: 126.9856 },
          },
          {
            name: "Dongdaemun Design Plaza",
            slot: "afternoon",
            at: { lat: 37.5669, lng: 127.0095 },
          },
          {
            name: "Woo Lae Oak",
            slot: "dinner",
            at: { lat: 37.5672, lng: 126.9992 },
          },
        ],
      },
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
      {
        name: "Where to eat in Tokyo",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Tokyo",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "Shibuya Scramble Crossing",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.tokyoDayOne",
        stops: [
          {
            name: "Meiji Jingu",
            slot: "morning",
            at: { lat: 35.6764, lng: 139.6993 },
          },
          {
            name: "Fuunji",
            slot: "lunch",
            at: { lat: 35.6843, lng: 139.6999 },
          },
          {
            name: "Shibuya Scramble Crossing",
            slot: "afternoon",
            at: { lat: 35.6595, lng: 139.7005 },
          },
          {
            name: "Kaikaya by the Sea",
            slot: "dinner",
            at: { lat: 35.6575, lng: 139.6945 },
          },
        ],
      },
      {
        title: "tripTeaser.tokyoDayTwo",
        stops: [
          {
            name: "Senso-ji",
            slot: "morning",
            at: { lat: 35.7148, lng: 139.7967 },
          },
          {
            name: "Daikokuya Tempura",
            slot: "lunch",
            at: { lat: 35.7121, lng: 139.7952 },
          },
          {
            name: "Tokyo Skytree",
            slot: "afternoon",
            at: { lat: 35.7101, lng: 139.8107 },
          },
          {
            name: "Otafuku",
            slot: "dinner",
            at: { lat: 35.718, lng: 139.794 },
          },
        ],
      },
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
      {
        name: "Where to eat in Toronto",
        source: { label: "tripTeaser.sourceReel" },
        places: 4,
        picture: "food",
      },
      {
        name: "Three days in Toronto",
        source: { label: "tripTeaser.sourceArticle" },
        places: 3,
        picture: "view",
      },
      {
        name: "CN Tower",
        source: { label: "tripTeaser.sourcePlace" },
        places: 1,
        picture: "place",
      },
    ],
    days: [
      {
        title: "tripTeaser.torontoDayOne",
        stops: [
          {
            name: "CN Tower",
            slot: "morning",
            at: { lat: 43.6426, lng: -79.3871 },
          },
          {
            name: "Pai Northern Thai Kitchen",
            slot: "lunch",
            at: { lat: 43.6484, lng: -79.3889 },
          },
          {
            name: "Hockey Hall of Fame",
            slot: "afternoon",
            at: { lat: 43.6469, lng: -79.3772 },
          },
          {
            name: "Richmond Station",
            slot: "dinner",
            at: { lat: 43.6515, lng: -79.3792 },
          },
        ],
      },
      {
        title: "tripTeaser.torontoDayTwo",
        stops: [
          {
            name: "Kensington Market",
            slot: "morning",
            at: { lat: 43.6548, lng: -79.4007 },
          },
          {
            name: "Seven Lives Tacos y Mariscos",
            slot: "lunch",
            at: { lat: 43.6544, lng: -79.4005 },
          },
          {
            name: "Chinatown",
            slot: "afternoon",
            at: { lat: 43.6529, lng: -79.398 },
          },
          {
            name: "Grey Gardens",
            slot: "dinner",
            at: { lat: 43.6553, lng: -79.4016 },
          },
        ],
      },
    ],
  },
} as const satisfies Record<SampleCityId, SampleCity>;
