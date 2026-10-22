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
  if (kind === "trip") return SAMPLE_CITY_IDS;
  return SAMPLE_CITY_IDS.filter(
    (id) => (kind === "date" ? DATE_NIGHTS : WEEKENDS)[id] !== undefined,
  );
}
