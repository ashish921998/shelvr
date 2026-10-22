import {
  SAMPLE_CITIES,
  SAMPLE_CITY_IDS,
  type SampleCity,
  type SampleCityId,
  type SampleDay,
  type SampleSave,
  type SampleSlot,
} from "@/lib/sample-cities";
import type { TextMessageKey } from "@/locales/message-types";

/** What a goal's sample plan is; travel is the existing day-by-day trip. */
export type PlanKind = "trip" | "date" | "weekend";

/** The one place each plan's sample post links to, so the post shared in onboarding is a stop in the plan. */
type PlanPost = {
  name: string;
  url: string;
  picture: "food" | "view";
};

type PlanCity = {
  saves: readonly SampleSave[];
  days: readonly SampleDay[];
  post: PlanPost;
};

type Stop = [
  slot: SampleSlot,
  name: string,
  lat: number,
  lng: number,
  onWater?: boolean,
];

function evening(title: TextMessageKey, stops: readonly Stop[]): SampleDay {
  return {
    title,
    stops: stops.map(([slot, name, lat, lng, onWater]) =>
      onWater
        ? { name, slot, at: { lat, lng }, onWater }
        : { name, slot, at: { lat, lng } },
    ),
  };
}

const wiki = (page: string) => `https://en.wikipedia.org/wiki/${page}`;

const DATE_NIGHTS: Partial<Record<SampleCityId, PlanCity>> = {
  prague: {
    saves: [
      {
        name: "Date night ideas in Prague",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Prague after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Charles Bridge",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Kampa Park", 50.0866, 14.4096],
        ["drinks", "Hemingway Bar", 50.0846, 14.4167],
        ["dessert", "Café Louvre", 50.0817, 14.4196],
        ["walk", "Charles Bridge", 50.0865, 14.4114, true],
      ]),
    ],
    post: {
      name: "Charles Bridge",
      url: wiki("Charles_Bridge"),
      picture: "view",
    },
  },
  "new-york": {
    saves: [
      {
        name: "Date night ideas in New York",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "The West Village at night",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Brooklyn Bridge",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Via Carota", 40.7333, -74.0037],
        ["drinks", "Employees Only", 40.7336, -74.0065],
        ["dessert", "Morgenstern's Finest Ice Cream", 40.7274, -73.9995],
        ["walk", "Brooklyn Bridge", 40.7061, -73.9969, true],
      ]),
    ],
    post: {
      name: "Brooklyn Bridge",
      url: wiki("Brooklyn_Bridge"),
      picture: "view",
    },
  },
  london: {
    saves: [
      {
        name: "Date night ideas in London",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "A night on the South Bank",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Dishoom",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Dishoom", 51.5124, -0.1269],
        ["drinks", "Dukes Bar", 51.5066, -0.1395],
        ["dessert", "Gelupo", 51.5115, -0.1334],
        ["walk", "South Bank", 51.5065, -0.1165],
      ]),
    ],
    post: { name: "Dishoom", url: wiki("Dishoom"), picture: "food" },
  },
  paris: {
    saves: [
      {
        name: "Date night ideas in Paris",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Paris by night",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Pont des Arts",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Le Relais de l'Entrecôte", 48.8536, 2.333],
        ["drinks", "Little Red Door", 48.8618, 2.3626],
        ["dessert", "Berthillon", 48.8516, 2.3567],
        ["walk", "Pont des Arts", 48.8583, 2.3375, true],
      ]),
    ],
    post: {
      name: "Pont des Arts",
      url: wiki("Pont_des_Arts"),
      picture: "view",
    },
  },
  chicago: {
    saves: [
      {
        name: "Date night ideas in Chicago",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Chicago after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Cafe Ba-Ba-Reeba!",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Cafe Ba-Ba-Reeba!", 41.919, -87.6487],
        ["drinks", "The Red Lion Pub", 41.9263, -87.6504],
        ["dessert", "Nothing Bundt Cakes", 41.9167, -87.657],
        ["walk", "North Avenue Beach", 41.9172, -87.627],
      ]),
    ],
    post: {
      name: "Cafe Ba-Ba-Reeba!",
      url: "https://maps.apple.com/?q=Cafe%20Ba-Ba-Reeba%21&ll=41.919%2C-87.6487",
      picture: "food",
    },
  },
  seattle: {
    saves: [
      {
        name: "Date night ideas in Seattle",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Seattle after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Momiji Capitol Hill",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Momiji Capitol Hill", 47.6148, -122.3165],
        ["drinks", "Quinn's Pub", 47.614, -122.3192],
        ["dessert", "Lowrider Cookie Company", 47.6128, -122.3011],
        ["walk", "Cal Anderson Park", 47.617, -122.3191],
      ]),
    ],
    post: {
      name: "Momiji Capitol Hill",
      url: "https://maps.apple.com/?q=Momiji%20Capitol%20Hill&ll=47.6148%2C-122.3165",
      picture: "food",
    },
  },
  austin: {
    saves: [
      {
        name: "Date night ideas in Austin",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Austin after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Perla's",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Perla's", 30.25, -97.7501],
        ["drinks", "Cidercade Austin", 30.2525, -97.741],
        ["dessert", "Sugar Mama's Bakeshop", 30.2462, -97.7565],
        [
          "walk",
          "Auditorium Shores at Town Lake Metropolitan Park",
          30.2615,
          -97.7522,
        ],
      ]),
    ],
    post: {
      name: "Perla's",
      url: "https://maps.apple.com/?q=Perla%27s&ll=30.25%2C-97.7501",
      picture: "food",
    },
  },
  dallas: {
    saves: [
      {
        name: "Date night ideas in Dallas",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Dallas after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Mexican Sugar",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Mexican Sugar", 32.7912, -96.8044],
        ["drinks", "Patrick Kennedy's Irish Pub", 32.7805, -96.8019],
        ["dessert", "Van Leeuwen Ice Cream", 32.8079, -96.7981],
        ["walk", "Klyde Warren Park", 32.7894, -96.8016],
      ]),
    ],
    post: {
      name: "Mexican Sugar",
      url: "https://maps.apple.com/?q=Mexican%20Sugar&ll=32.7912%2C-96.8044",
      picture: "food",
    },
  },
  vancouver: {
    saves: [
      {
        name: "Date night ideas in Vancouver",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Vancouver after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Alouette Bistro",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Alouette Bistro", 49.2853, -123.1183],
        ["drinks", "Is That French", 49.2833, -123.1056],
        ["dessert", "D'oro Gelato e Caffè", 49.2861, -123.1275],
        ["walk", "English Bay Beach", 49.2863, -123.1435],
      ]),
    ],
    post: {
      name: "Alouette Bistro",
      url: "https://maps.apple.com/?q=Alouette%20Bistro&ll=49.2853%2C-123.1183",
      picture: "food",
    },
  },
  montreal: {
    saves: [
      {
        name: "Date night ideas in Montreal",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Montreal after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "L'Express",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "L'Express", 45.5203, -73.5744],
        ["drinks", "Aux Verres Stérilisés Inc", 45.5236, -73.5764],
        ["dessert", "Hof Kelsten", 45.5203, -73.5871],
        ["walk", "La Fontaine Park", 45.5273, -73.5704],
      ]),
    ],
    post: {
      name: "L'Express",
      url: "https://maps.apple.com/?q=L%27Express&ll=45.5203%2C-73.5744",
      picture: "food",
    },
  },
  madrid: {
    saves: [
      {
        name: "Date night ideas in Madrid",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Madrid after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Saona",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Saona", 40.4253, -3.7137],
        ["drinks", "Ella Sky Bar Madrid", 40.4205, -3.7052],
        ["dessert", "Demasié", 40.4277, -3.704],
        ["walk", "Cibeles Fountain", 40.4193, -3.6931],
      ]),
    ],
    post: {
      name: "Saona",
      url: "https://maps.apple.com/?q=Saona&ll=40.4253%2C-3.7137",
      picture: "food",
    },
  },
  berlin: {
    saves: [
      {
        name: "Date night ideas in Berlin",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Berlin after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "3 Sisters",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "3 Sisters", 52.5039, 13.4244],
        ["drinks", "Café Luzia", 52.5017, 13.4183],
        ["dessert", "Duo Sicilian Ice Cream", 52.5007, 13.4388],
        ["walk", "Feuerwehrbrunnen", 52.502, 13.4243],
      ]),
    ],
    post: {
      name: "3 Sisters",
      url: "https://maps.apple.com/?q=3%20Sisters&ll=52.5039%2C13.4244",
      picture: "food",
    },
  },
  florence: {
    saves: [
      {
        name: "Date night ideas in Florence",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Florence after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "En cucina casalinga giapponese",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "En cucina casalinga giapponese", 43.7707, 11.2665],
        ["drinks", "Loggia Roof Bar", 43.7662, 11.2474],
        ["dessert", "Bottega di Pasticceria", 43.7639, 11.2736],
        ["walk", "Boboli Gardens", 43.7625, 11.2484],
      ]),
    ],
    post: {
      name: "En cucina casalinga giapponese",
      url: "https://maps.apple.com/?q=En%20cucina%20casalinga%20giapponese&ll=43.7707%2C11.2665",
      picture: "food",
    },
  },
  amsterdam: {
    saves: [
      {
        name: "Date night ideas in Amsterdam",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Amsterdam after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Foodhallen",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Foodhallen", 52.3668, 4.8679],
        ["drinks", "Bar Centraal", 52.3673, 4.8665],
        ["dessert", "Massimo Gelato", 52.3681, 4.8665],
        ["walk", "Vondelpark", 52.358, 4.8686],
      ]),
    ],
    post: {
      name: "Foodhallen",
      url: "https://maps.apple.com/?q=Foodhallen&ll=52.3668%2C4.8679",
      picture: "food",
    },
  },
  rome: {
    saves: [
      {
        name: "Date night ideas in Rome",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Rome after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Retrobottega",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Retrobottega", 41.8891, 12.4825],
        ["drinks", "The Court Bar. Palazzo Manfredi", 41.8902, 12.4956],
        ["dessert", "Fatamorgana Monti", 41.8957, 12.4933],
        ["walk", "Giardino degli Aranci", 41.8851, 12.4804],
      ]),
    ],
    post: {
      name: "Retrobottega",
      url: "https://maps.apple.com/?q=Retrobottega&ll=41.8891%2C12.4825",
      picture: "food",
    },
  },
  copenhagen: {
    saves: [
      {
        name: "Date night ideas in Copenhagen",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Copenhagen after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Juju",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Juju", 55.6899, 12.5751],
        ["drinks", "Jazzhus Montmartre", 55.682, 12.5825],
        ["dessert", "Østerberg Ice Cream", 55.699, 12.5794],
        ["walk", "Garden of the Royal Library", 55.6746, 12.5812],
      ]),
    ],
    post: {
      name: "Juju",
      url: "https://maps.apple.com/?q=Juju&ll=55.6899%2C12.5751",
      picture: "food",
    },
  },
  milan: {
    saves: [
      {
        name: "Date night ideas in Milan",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Milan after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Pescherie Riunite - Montenero",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Pescherie Riunite - Montenero", 45.4562, 9.2045],
        ["drinks", "SunEleven Rooftop Bar", 45.4646, 9.1954],
        ["dessert", "Alberto Marchetti Gelaterie", 45.4611, 9.2074],
        ["walk", "Duomo di Milano", 45.4641, 9.1919],
      ]),
    ],
    post: {
      name: "Pescherie Riunite - Montenero",
      url: "https://maps.apple.com/?q=Pescherie%20Riunite%20-%20Montenero&ll=45.4562%2C9.2045",
      picture: "food",
    },
  },
  "los-angeles": {
    saves: [
      {
        name: "Date night ideas in Los Angeles",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Los Angeles after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Donna's",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Donna's", 34.0763, -118.2566],
        ["drinks", "Thunderbolt", 34.0664, -118.2541],
        ["dessert", "The Chocolate Dispensary", 34.0809, -118.255],
        ["walk", "Echo Park Lake", 34.0729, -118.2605],
      ]),
    ],
    post: {
      name: "Donna's",
      url: "https://maps.apple.com/?q=Donna%27s&ll=34.0763%2C-118.2566",
      picture: "food",
    },
  },
  "san-francisco": {
    saves: [
      {
        name: "Date night ideas in San Francisco",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "San Francisco after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Good Good Culture Club",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Good Good Culture Club", 37.7618, -122.423],
        ["drinks", "Arcana", 37.7568, -122.4191],
        ["dessert", "Kokak Chocolates", 37.761, -122.4307],
        ["walk", "Saturn Street Steps", 37.7627, -122.4405],
      ]),
    ],
    post: {
      name: "Good Good Culture Club",
      url: "https://maps.apple.com/?q=Good%20Good%20Culture%20Club&ll=37.7618%2C-122.423",
      picture: "food",
    },
  },
  toronto: {
    saves: [
      {
        name: "Date night ideas in Toronto",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Toronto after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Pizzeria Badiali",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Pizzeria Badiali", 43.6461, -79.4233],
        ["drinks", "Paris Paris", 43.6474, -79.4204],
        ["dessert", "Tochal ☆ Downtown", 43.6493, -79.4249],
        ["walk", "Ontario Place", 43.6311, -79.4127],
      ]),
    ],
    post: {
      name: "Pizzeria Badiali",
      url: "https://maps.apple.com/?q=Pizzeria%20Badiali&ll=43.6461%2C-79.4233",
      picture: "food",
    },
  },
  barcelona: {
    saves: [
      {
        name: "Date night ideas in Barcelona",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Barcelona after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Feroz Barcelona",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Feroz Barcelona", 41.3965, 2.1509],
        ["drinks", "Missa Bar", 41.3992, 2.1579],
        ["dessert", "CAUA CACAO ROASTERS", 41.3937, 2.1499],
        ["walk", "Muñoz Ramonet Gardens", 41.3964, 2.147],
      ]),
    ],
    post: {
      name: "Feroz Barcelona",
      url: "https://maps.apple.com/?q=Feroz%20Barcelona&ll=41.3965%2C2.1509",
      picture: "food",
    },
  },
  lisbon: {
    saves: [
      {
        name: "Date night ideas in Lisbon",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Lisbon after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Plano Restaurante",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Plano Restaurante", 38.7197, -9.1266],
        ["drinks", "ROOFTOP Bar - Hotel Mundial", 38.715, -9.137],
        ["dessert", "Alfama Doce", 38.7121, -9.1288],
        ["walk", "Jardim do Torel", 38.7192, -9.1412],
      ]),
    ],
    post: {
      name: "Plano Restaurante",
      url: "https://maps.apple.com/?q=Plano%20Restaurante&ll=38.7197%2C-9.1266",
      picture: "food",
    },
  },
  seoul: {
    saves: [
      {
        name: "Date night ideas in Seoul",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Seoul after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Tosokchon Samgyetang",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Tosokchon Samgyetang", 37.5778, 126.9716],
        ["drinks", "Bar Cham", 37.5792, 126.9704],
        ["dessert", "Biwon tteokjip", 37.5798, 126.9849],
        ["walk", "Seoul Plaza", 37.5656, 126.978],
      ]),
    ],
    post: {
      name: "Tosokchon Samgyetang",
      url: "https://maps.apple.com/?q=Tosokchon%20Samgyetang&ll=37.5778%2C126.9716",
      picture: "food",
    },
  },
  tokyo: {
    saves: [
      {
        name: "Date night ideas in Tokyo",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Tokyo after dark",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Menchirashi",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.dateNight", [
        ["dinner", "Menchirashi", 35.6665, 139.7051],
        ["drinks", "The SG Club", 35.6642, 139.6992],
        ["dessert", "GARIGUETTE", 35.6649, 139.7108],
        ["walk", "Shibuya Fureai Botanical Center", 35.6533, 139.7077],
      ]),
    ],
    post: {
      name: "Menchirashi",
      url: "https://maps.apple.com/?q=Menchirashi&ll=35.6665%2C139.7051",
      picture: "food",
    },
  },
};

const WEEKENDS: Partial<Record<SampleCityId, PlanCity>> = {
  prague: {
    saves: [
      {
        name: "Where to eat in Prague",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Prague's best cafés",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "U Fleků",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "U Fleků", 50.079, 14.4176],
        ["dinner", "Lokál Dlouhááá", 50.0905, 14.4259],
      ]),
      evening("plan.sunday", [
        ["brunch", "Café Savoy", 50.0801, 14.4097],
        ["coffee", "Kavárna Slavia", 50.0814, 14.4135],
      ]),
    ],
    post: { name: "U Fleků", url: wiki("U_Fleků"), picture: "food" },
  },
  "new-york": {
    saves: [
      {
        name: "Where to eat in New York",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Old-school New York cafés",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Katz's Delicatessen",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Katz's Delicatessen", 40.7223, -73.9874],
        ["dinner", "Joe's Pizza", 40.7306, -74.0021],
      ]),
      evening("plan.sunday", [
        ["brunch", "Russ & Daughters Cafe", 40.7194, -73.9897],
        ["coffee", "Caffe Reggio", 40.7302, -74.0003],
      ]),
    ],
    post: {
      name: "Katz's Delicatessen",
      url: wiki("Katz%27s_Delicatessen"),
      picture: "food",
    },
  },
  london: {
    saves: [
      {
        name: "Where to eat in London",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "London's best coffee",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Borough Market",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Borough Market", 51.5055, -0.091],
        ["dinner", "Barrafina Dean Street", 51.5135, -0.1318],
      ]),
      evening("plan.sunday", [
        ["brunch", "The Breakfast Club Soho", 51.5136, -0.1373],
        ["coffee", "Monmouth Coffee", 51.5054, -0.0915],
      ]),
    ],
    post: {
      name: "Borough Market",
      url: wiki("Borough_Market"),
      picture: "food",
    },
  },
  paris: {
    saves: [
      {
        name: "Where to eat in Paris",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Paris cafés worth the wait",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Bouillon Chartier",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Marché des Enfants Rouges", 48.8628, 2.3618],
        ["dinner", "Bouillon Chartier", 48.872, 2.3445],
      ]),
      evening("plan.sunday", [
        ["brunch", "Holybelly", 48.8732, 2.3614],
        ["coffee", "Café de Flore", 48.8541, 2.3326],
      ]),
    ],
    post: {
      name: "Bouillon Chartier",
      url: wiki("Bouillon_Chartier"),
      picture: "food",
    },
  },
  chicago: {
    saves: [
      {
        name: "Where to eat in Chicago",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Chicago's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Au Cheval",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Au Cheval", 41.8846, -87.6476],
        ["dinner", "Aba", 41.887, -87.6489],
      ]),
      evening("plan.sunday", [
        ["brunch", "Wishbone", 41.885, -87.6425],
        ["coffee", "Sawada Coffee", 41.8836, -87.6487],
      ]),
    ],
    post: {
      name: "Au Cheval",
      url: "https://maps.apple.com/?q=Au%20Cheval&ll=41.8846%2C-87.6476",
      picture: "food",
    },
  },
  seattle: {
    saves: [
      {
        name: "Where to eat in Seattle",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Seattle's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Umi Sake House",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Umi Sake House", 47.6133, -122.3461],
        ["dinner", "Sushi Kashiba", 47.6098, -122.3415],
      ]),
      evening("plan.sunday", [
        ["brunch", "Biscuit Bitch Pike Place", 47.6104, -122.3417],
        ["coffee", "Pegasus Coffee Bar", 47.6037, -122.3325],
      ]),
    ],
    post: {
      name: "Umi Sake House",
      url: "https://maps.apple.com/?q=Umi%20Sake%20House&ll=47.6133%2C-122.3461",
      picture: "food",
    },
  },
  austin: {
    saves: [
      {
        name: "Where to eat in Austin",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Austin's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Este",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Este", 30.2839, -97.7195],
        ["dinner", "Nixta Taqueria", 30.275, -97.7133],
      ]),
      evening("plan.sunday", [
        ["brunch", "Snooze, an A.M. Eatery", 30.2635, -97.7311],
        ["coffee", "The Buzz Mill", 30.2417, -97.7269],
      ]),
    ],
    post: {
      name: "Este",
      url: "https://maps.apple.com/?q=Este&ll=30.2839%2C-97.7195",
      picture: "food",
    },
  },
  dallas: {
    saves: [
      {
        name: "Where to eat in Dallas",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Dallas's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "The Mexican",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "The Mexican", 32.7964, -96.8227],
        ["dinner", "El Carlos Elegante", 32.7902, -96.82],
      ]),
      evening("plan.sunday", [
        ["brunch", "Little Daisy", 32.7813, -96.8009],
        ["coffee", "San Martin Bakery and Restaurant", 32.8022, -96.7999],
      ]),
    ],
    post: {
      name: "The Mexican",
      url: "https://maps.apple.com/?q=The%20Mexican&ll=32.7964%2C-96.8227",
      picture: "food",
    },
  },
  vancouver: {
    saves: [
      {
        name: "Where to eat in Vancouver",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Vancouver's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Le Crocodile by Rob Feenie",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Le Crocodile by Rob Feenie", 49.2825, -123.1252],
        ["dinner", "Tableau Bar Bistro", 49.2876, -123.1235],
      ]),
      evening("plan.sunday", [
        ["brunch", "Their There", 49.2679, -123.1514],
        [
          "coffee",
          "Pallet Coffee Roasters - West Broadway",
          49.2636,
          -123.1508,
        ],
      ]),
    ],
    post: {
      name: "Le Crocodile by Rob Feenie",
      url: "https://maps.apple.com/?q=Le%20Crocodile%20by%20Rob%20Feenie&ll=49.2825%2C-123.1252",
      picture: "food",
    },
  },
  montreal: {
    saves: [
      {
        name: "Where to eat in Montreal",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Montreal's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Chez Victoire",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Chez Victoire", 45.5311, -73.5765],
        ["dinner", "Le Violon", 45.5336, -73.5787],
      ]),
      evening("plan.sunday", [
        ["brunch", "Café St-Barth - Breakfast", 45.5092, -73.5736],
        ["coffee", "Café Castel", 45.5021, -73.5766],
      ]),
    ],
    post: {
      name: "Chez Victoire",
      url: "https://maps.apple.com/?q=Chez%20Victoire&ll=45.5311%2C-73.5765",
      picture: "food",
    },
  },
  madrid: {
    saves: [
      {
        name: "Where to eat in Madrid",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Madrid's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Castizo Velázquez",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Castizo Velázquez", 40.4352, -3.6836],
        ["dinner", "El Perro y La Galleta - Restaurant", 40.4205, -3.6874],
      ]),
      evening("plan.sunday", [
        ["brunch", "Watts Cantina", 40.4117, -3.7118],
        ["coffee", "FELIZ COFFEE TO STAY", 40.4153, -3.6991],
      ]),
    ],
    post: {
      name: "Castizo Velázquez",
      url: "https://maps.apple.com/?q=Castizo%20Vel%C3%A1zquez&ll=40.4352%2C-3.6836",
      picture: "food",
    },
  },
  berlin: {
    saves: [
      {
        name: "Where to eat in Berlin",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Berlin's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Holzmarkt 25",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Holzmarkt 25", 52.5113, 13.4268],
        ["dinner", "annelies", 52.4986, 13.4349],
      ]),
      evening("plan.sunday", [
        ["brunch", "Café Morgenrot", 52.5375, 13.4089],
        ["coffee", "Zeit für Brot", 52.528, 13.4086],
      ]),
    ],
    post: {
      name: "Holzmarkt 25",
      url: "https://maps.apple.com/?q=Holzmarkt%2025&ll=52.5113%2C13.4268",
      picture: "food",
    },
  },
  florence: {
    saves: [
      {
        name: "Where to eat in Florence",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Florence's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "RamenGirl by ENOTECALUCA Firenze",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "RamenGirl by ENOTECALUCA Firenze", 43.7735, 11.214],
        ["dinner", "Nima Sushi", 43.7917, 11.2306],
      ]),
      evening("plan.sunday", [
        ["brunch", "Todo Modo", 43.7716, 11.248],
        ["coffee", "La Cité", 43.7693, 11.2458],
      ]),
    ],
    post: {
      name: "RamenGirl by ENOTECALUCA Firenze",
      url: "https://maps.apple.com/?q=RamenGirl%20by%20ENOTECALUCA%20Firenze&ll=43.7735%2C11.214",
      picture: "food",
    },
  },
  amsterdam: {
    saves: [
      {
        name: "Where to eat in Amsterdam",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Amsterdam's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Staring at Jacob",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Staring at Jacob", 52.3623, 4.8618],
        ["dinner", "nNea Pizza", 52.3694, 4.8704],
      ]),
      evening("plan.sunday", [
        ["brunch", "Bosco", 52.3652, 4.8739],
        ["coffee", "Back to Black", 52.3611, 4.8885],
      ]),
    ],
    post: {
      name: "Staring at Jacob",
      url: "https://maps.apple.com/?q=Staring%20at%20Jacob&ll=52.3623%2C4.8618",
      picture: "food",
    },
  },
  rome: {
    saves: [
      {
        name: "Where to eat in Rome",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Rome's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Ristorante Tullio",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Ristorante Tullio", 41.9044, 12.4899],
        ["dinner", "Trattoria della Barchetta dal 1924", 41.9061, 12.4715],
      ]),
      evening("plan.sunday", [
        ["brunch", "Sant' Eustachio Caffè", 41.8983, 12.4754],
        ["coffee", "Ciampini Roma", 41.9037, 12.478],
      ]),
    ],
    post: {
      name: "Ristorante Tullio",
      url: "https://maps.apple.com/?q=Ristorante%20Tullio&ll=41.9044%2C12.4899",
      picture: "food",
    },
  },
  copenhagen: {
    saves: [
      {
        name: "Where to eat in Copenhagen",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Copenhagen's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "SSAM Korean Food Bar",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "SSAM Korean Food Bar", 55.6726, 12.5621],
        ["dinner", "Sakura벚꽃", 55.6822, 12.5802],
      ]),
      evening("plan.sunday", [
        ["brunch", "Sonny", 55.677, 12.5743],
        ["coffee", "Coffee Collective Bernikow", 55.6801, 12.5825],
      ]),
    ],
    post: {
      name: "SSAM Korean Food Bar",
      url: "https://maps.apple.com/?q=SSAM%20Korean%20Food%20Bar&ll=55.6726%2C12.5621",
      picture: "food",
    },
  },
  milan: {
    saves: [
      {
        name: "Where to eat in Milan",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Milan's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Langosteria",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Langosteria", 45.4556, 9.1684],
        ["dinner", "Antica Osteria del Mare", 45.4383, 9.1751],
      ]),
      evening("plan.sunday", [
        ["brunch", "Hygge", 45.4584, 9.1766],
        ["coffee", "NOWHERE - CAFE", 45.456, 9.1817],
      ]),
    ],
    post: {
      name: "Langosteria",
      url: "https://maps.apple.com/?q=Langosteria&ll=45.4556%2C9.1684",
      picture: "food",
    },
  },
  "los-angeles": {
    saves: [
      {
        name: "Where to eat in Los Angeles",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Los Angeles's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Felix Trattoria",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Felix Trattoria", 33.9922, -118.4719],
        ["dinner", "Gjelina", 33.9905, -118.465],
      ]),
      evening("plan.sunday", [
        ["brunch", "Cafe Gratitude", 33.9981, -118.4737],
        ["coffee", "Gjusta", 33.9952, -118.4745],
      ]),
    ],
    post: {
      name: "Felix Trattoria",
      url: "https://maps.apple.com/?q=Felix%20Trattoria&ll=33.9922%2C-118.4719",
      picture: "food",
    },
  },
  "san-francisco": {
    saves: [
      {
        name: "Where to eat in San Francisco",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "San Francisco's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "SAN HO WON",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "SAN HO WON", 37.7596, -122.4102],
        ["dinner", "Flour + Water", 37.7589, -122.4123],
      ]),
      evening("plan.sunday", [
        ["brunch", "Wildseed", 37.7976, -122.4324],
        ["coffee", "Kopiku Indonesian Coffee", 37.8009, -122.4253],
      ]),
    ],
    post: {
      name: "SAN HO WON",
      url: "https://maps.apple.com/?q=SAN%20HO%20WON&ll=37.7596%2C-122.4102",
      picture: "food",
    },
  },
  toronto: {
    saves: [
      {
        name: "Where to eat in Toronto",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Toronto's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Raku",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Raku", 43.6482, -79.3994],
        ["dinner", "PAI", 43.6479, -79.3887],
      ]),
      evening("plan.sunday", [
        ["brunch", "Avenue Open Kitchen", 43.6472, -79.3964],
        ["coffee", "Carbonic Coffee (Baldwin)", 43.6558, -79.3935],
      ]),
    ],
    post: {
      name: "Raku",
      url: "https://maps.apple.com/?q=Raku&ll=43.6482%2C-79.3994",
      picture: "food",
    },
  },
  barcelona: {
    saves: [
      {
        name: "Where to eat in Barcelona",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Barcelona's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "FUGAZ",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "FUGAZ", 41.3886, 2.1559],
        ["dinner", "O'Retorno", 41.3869, 2.1527],
      ]),
      evening("plan.sunday", [
        ["brunch", "Caravelle", 41.3823, 2.1688],
        ["coffee", "Soul Cafe Barcelona", 41.3804, 2.1798],
      ]),
    ],
    post: {
      name: "FUGAZ",
      url: "https://maps.apple.com/?q=FUGAZ&ll=41.3886%2C2.1559",
      picture: "food",
    },
  },
  lisbon: {
    saves: [
      {
        name: "Where to eat in Lisbon",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Lisbon's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Loco",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Loco", 38.7125, -9.1606],
        ["dinner", "Âmago", 38.7176, -9.1474],
      ]),
      evening("plan.sunday", [
        ["brunch", "Zenith", 38.7191, -9.1427],
        ["coffee", "Brotéria", 38.7134, -9.1436],
      ]),
    ],
    post: {
      name: "Loco",
      url: "https://maps.apple.com/?q=Loco&ll=38.7125%2C-9.1606",
      picture: "food",
    },
  },
  seoul: {
    saves: [
      {
        name: "Where to eat in Seoul",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Seoul's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Geumdwaeji Sikdang",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        ["lunch", "Geumdwaeji Sikdang", 37.5571, 127.0117],
        ["dinner", "Woo Lae Oak", 37.5682, 126.9987],
      ]),
      evening("plan.sunday", [
        ["brunch", "Grain Seoul", 37.5662, 126.9274],
        ["coffee", "Koriko Cafe", 37.565, 126.9247],
      ]),
    ],
    post: {
      name: "Geumdwaeji Sikdang",
      url: "https://maps.apple.com/?q=Geumdwaeji%20Sikdang&ll=37.5571%2C127.0117",
      picture: "food",
    },
  },
  tokyo: {
    saves: [
      {
        name: "Where to eat in Tokyo",
        source: "tripTeaser.sourceReel",
        places: 2,
        picture: "food",
      },
      {
        name: "Tokyo's best brunch spots",
        source: "tripTeaser.sourceArticle",
        places: 1,
        picture: "view",
      },
      {
        name: "Nihonbashi Kaisen Donburi Tsujihan Nihonbashi",
        source: "tripTeaser.sourcePlace",
        places: 1,
        picture: "place",
      },
    ],
    days: [
      evening("plan.saturday", [
        [
          "lunch",
          "Nihonbashi Kaisen Donburi Tsujihan Nihonbashi",
          35.6807,
          139.7716,
        ],
        ["dinner", "Godaime Hanayama Udon Nihonbashi", 35.6811, 139.7747],
      ]),
      evening("plan.sunday", [
        ["brunch", "TASTE THE WORLD Ginza", 35.6715, 139.7692],
        ["coffee", "ATELIER MATCHA", 35.6661, 139.7652],
      ]),
    ],
    post: {
      name: "Nihonbashi Kaisen Donburi Tsujihan Nihonbashi",
      url: "https://maps.apple.com/?q=Nihonbashi%20Kaisen%20Donburi%20Tsujihan%20Nihonbashi&ll=35.6807%2C139.7716",
      picture: "food",
    },
  },
};

const FALLBACK_CITY: SampleCityId = "prague";

/** The city a date night or weekend is drawn in: the picked one when it has that plan, Prague otherwise. */
export function planCity(
  kind: Exclude<PlanKind, "trip">,
  city: SampleCityId | null,
): SampleCityId {
  const plans = kind === "date" ? DATE_NIGHTS : WEEKENDS;
  return city !== null && plans[city] !== undefined ? city : FALLBACK_CITY;
}

/** A date night or weekend as the trip builder takes a city: that city's map water with the plan's saves and stops. */
export function planAsCity(
  kind: Exclude<PlanKind, "trip">,
  id: SampleCityId,
): SampleCity {
  const plan = (kind === "date" ? DATE_NIGHTS : WEEKENDS)[id]!;
  const city = SAMPLE_CITIES[id];
  return { ...city, saves: plan.saves, days: plan.days };
}

/** Every plan's post link, so a held practice share of one is recognised as practice. */
export function isPlanPost(url: string): boolean {
  return [DATE_NIGHTS, WEEKENDS].some((plans) =>
    Object.values(plans).some((plan) => plan.post.url === url),
  );
}

export function planPost(
  kind: Exclude<PlanKind, "trip">,
  id: SampleCityId,
): PlanPost {
  return (kind === "date" ? DATE_NIGHTS : WEEKENDS)[id]!.post;
}

/** The cities a plan is written for, so the city step offers only those. */
export function planCities(kind: PlanKind): readonly SampleCityId[] {
  if (kind === "trip")
    return SAMPLE_CITY_IDS.filter((id) => SAMPLE_CITIES[id].days.length > 0);
  return SAMPLE_CITY_IDS.filter(
    (id) => (kind === "date" ? DATE_NIGHTS : WEEKENDS)[id] !== undefined,
  );
}
