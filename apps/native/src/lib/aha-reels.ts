import type { SampleCityId, SampleSlot } from "@/lib/sample-cities";
import type { PlanKind } from "@/lib/sample-plans";

type ReelPlace = [slot: SampleSlot, name: string, lat: number, lng: number];

/** A real public reel onboarding plays, and the first three places its video shows, in that order, read ahead of time so the demo needs no network but the video. */
export type AhaReel = {
  code: string;
  /** The creator's Instagram username, credited on the reel. */
  handle: string;
  places: readonly ReelPlace[];
};

const AHA_REELS: Partial<
  Record<PlanKind, Partial<Record<SampleCityId, AhaReel>>>
> = {
  date: {
    austin: {
      code: "DFvbj_8vC6x",
      handle: "365thingsaustin",
      places: [
        ["dinner", "Eberly", 30.258564, -97.75885],
        ["dinner", "The Guest House", 30.265642, -97.74933],
        ["drinks", "Jupiter Supper Club", 30.269741, -97.74242],
      ],
    },
    "new-york": {
      code: "DDLIccFPQZ0",
      handle: "nycfoodhurtmywallet",
      places: [
        ["drinks", "RH Champagne & Caviar Bar", 40.73951, -74.00705],
        ["drinks", "Bar Pendry", 40.753277, -73.99857],
        [
          "drinks",
          "The Gold Room at Lotte New York Palace",
          40.757965,
          -73.974884,
        ],
      ],
    },
    "los-angeles": {
      code: "DF6mZ9-Ml-s",
      handle: "cal.euphoria",
      places: [
        ["drinks", "The Wolves", 34.04703, -118.25024],
        ["dinner", "Le Petit Paris", 34.048344, -118.24853],
        ["dinner", "Joyce", 34.04627, -118.257164],
      ],
    },
    chicago: {
      code: "DUzIHJpkgO4",
      handle: "windy_citychicago",
      places: [
        ["dinner", "Olio e Più", 41.8906, -87.62938],
        ["dinner", "Mastro's Steakhouse", 41.891518, -87.62979],
        ["dinner", "Benihana", 41.899025, -87.62376],
      ],
    },
    "san-francisco": {
      code: "DT7TEXWDZQw",
      handle: "jessevicario",
      places: [
        ["dinner", "Waterbar", 37.790493, -122.38904],
        ["brunch", "The Palm Court", 37.788124, -122.4019],
        ["dinner", "La Mar", 37.79721, -122.39544],
      ],
    },
  },
  trip: {
    austin: {
      code: "Da1LtsNRybN",
      handle: "austinites101",
      places: [
        ["afternoon", "Austin Motel", 30.251701, -97.749344],
        ["morning", "Heritage Boot Co.", 30.246634, -97.75118],
        ["coffee", "Jo's Coffee", 30.251045, -97.749374],
      ],
    },
    "new-york": {
      code: "DYmdDuTR0TI",
      handle: "karenkuo24",
      places: [
        ["morning", "American Museum of Natural History", 40.781322, -73.97399],
        ["afternoon", "Staten Island Ferry", 40.701084, -74.0131],
        ["walk", "Times Square", 40.757977, -73.98554],
      ],
    },
    "los-angeles": {
      code: "DGgGkFFpm31",
      handle: "teresa.ctw",
      places: [
        ["coffee", "Muso Coffee", 34.032143, -118.36981],
        ["morning", "Blum", 34.033108, -118.37563],
        ["lunch", "Arden", 34.090878, -118.37003],
      ],
    },
    chicago: {
      code: "CqRVwyDDYFD",
      handle: "roamingwithimran",
      places: [
        ["walk", "Chicago Riverwalk", 41.88847, -87.62323],
        ["afternoon", "Chess Pavilion", 41.911316, -87.62495],
        ["walk", "Lakefront Trail", 41.901164, -87.619455],
      ],
    },
    "san-francisco": {
      code: "DbygzfbgfK-",
      handle: "bayareauzi",
      places: [
        ["walk", "Salesforce Park", 37.789738, -122.396164],
        ["walk", "Lovers' Lane & Wood Line", 37.793186, -122.44859],
        ["afternoon", "Cable Car Museum", 37.794624, -122.41153],
      ],
    },
  },
  weekend: {
    austin: {
      code: "DKXG_-yRUF2",
      handle: "austin.bucketlist",
      places: [
        ["lunch", "Hula Hut", 30.294683, -97.78433],
        ["lunch", "Ski Shores Cafe", 30.333466, -97.822914],
        ["dinner", "Quince Lakehouse", 30.295254, -97.7842],
      ],
    },
    "new-york": {
      code: "DLyj62RsbTj",
      handle: "beli_eats",
      places: [
        ["dinner", "Chrissy's Pizza", 40.724697, -73.94769],
        ["dinner", "Bernie's", 40.721893, -73.950554],
        ["lunch", "Taqueria Ramirez", 40.727898, -73.95694],
      ],
    },
    "los-angeles": {
      code: "DQZtAA6Ebfr",
      handle: "beccsvoyage",
      places: [
        ["dinner", "Yamashiro", 34.10576, -118.342094],
        ["dinner", "Alba", 34.082844, -118.375015],
        ["dinner", "Bavel", 34.041473, -118.233],
      ],
    },
    chicago: {
      code: "C4Ei5DHLmrq",
      handle: "chicago.by.ren",
      places: [
        ["lunch", "D'Amato's Bakery", 41.891224, -87.655655],
        ["dinner", "Izakaya Momotaro", 41.885887, -87.64845],
        ["dinner", "Elina's", 41.891243, -87.65765],
      ],
    },
    "san-francisco": {
      code: "Dbaz6GDu1dA",
      handle: "erinscozykitchen",
      places: [
        ["morning", "Butter & Crumble", 37.805077, -122.40969],
        ["lunch", "Molinari Delicatessen", 37.79849, -122.40787],
        ["lunch", "Golden Boy Pizza", 37.799725, -122.40807],
      ],
    },
  },
};

export function ahaReel(kind: PlanKind, city: SampleCityId): AhaReel | null {
  return AHA_REELS[kind]?.[city] ?? null;
}

/** The link a real share from Instagram carries, so the first save is this reel. */
export function ahaReelUrl(reel: AhaReel): string {
  return `https://www.instagram.com/reel/${reel.code}/`;
}
