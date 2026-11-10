import type { SampleCityId, SampleSlot } from "@/lib/sample-cities";

type ReelPlace = [slot: SampleSlot, name: string, lat: number, lng: number];

/** A real public reel about a city's hidden gems that onboarding plays, and the three places it names that the demo pins, read ahead of time so the demo needs no network but the video. */
export type AhaReel = {
  code: string;
  /** The creator's Instagram username, credited on the reel. */
  handle: string;
  places: readonly ReelPlace[];
};

const AHA_REELS: Record<SampleCityId, AhaReel> = {
  barcelona: {
    code: "C6ogZ9QtWYG",
    handle: "fattiretours",
    places: [
      ["morning", "Sant Pau Recinte Modernista", 41.413976, 2.175547],
      ["afternoon", "Casa Vicens", 41.403506, 2.150625],
      ["dinner", "Palau de la Música Catalana", 41.387584, 2.175232],
    ],
  },
  lisbon: {
    code: "DBQ_Yfpxlwp",
    handle: "travelswithmr",
    places: [
      ["morning", "Ler Devagar", 38.702761, -9.178434],
      ["afternoon", "Casa do Alentejo", 38.715923, -9.139854],
      ["drinks", "Mini Bar", 38.712328, -9.142376],
    ],
  },
  london: {
    code: "DLxnkQioXcJ",
    handle: "volga_londonstories",
    places: [
      ["walk", "The Hill Garden and Pergola", 51.565048, -0.182291],
      ["dinner", "The Standard, London", 51.52947, -0.12433],
      ["drinks", "Mr Fogg's Apothecary", 51.513087, -0.146877],
    ],
  },
  "los-angeles": {
    code: "DQZtAA6Ebfr",
    handle: "beccsvoyage",
    places: [
      ["dinner", "Yamashiro", 34.105826, -118.342318],
      ["dinner", "Alba", 34.082904, -118.375121],
      ["dinner", "Bavel", 34.041432, -118.232954],
    ],
  },
  "new-york": {
    code: "DLyj62RsbTj",
    handle: "beli_eats",
    places: [
      ["dinner", "Chrissy’s Pizza", 40.724637, -73.947671],
      ["dinner", "Bernie’s", 40.721912, -73.950585],
      ["lunch", "Taqueria Ramirez", 40.727887, -73.957007],
    ],
  },
  paris: {
    code: "DBg6hPNI5JX",
    handle: "monsieur.jim",
    places: [
      ["afternoon", "École des Beaux-Arts", 48.857132, 2.333844],
      ["afternoon", "Opéra Comique", 48.871122, 2.337847],
      ["walk", "Arènes de Lutèce", 48.845061, 2.352937],
    ],
  },
  prague: {
    code: "C2vPh-2LxKT",
    handle: "prague.space.guide",
    places: [
      ["morning", "Průhonice Park", 50.001247, 14.558803],
      ["afternoon", "Troja Palace", 50.116402, 14.413023],
      ["walk", "Wallenstein Garden", 50.090164, 14.406429],
    ],
  },
  "san-francisco": {
    code: "DSljQ2yD5IM",
    handle: "yourglobalfoodiebff",
    places: [
      ["lunch", "Pho Huong Viet", 37.780062, -122.481082],
      ["brunch", "Feng Ze Yuan", 37.775183, -122.506055],
      ["dinner", "Champa Garden", 37.725067, -122.460144],
    ],
  },
  seoul: {
    code: "C9r0xsuvuO3",
    handle: "homes_in_korea",
    places: [
      ["morning", "Kyung Hee University", 37.597121, 127.051987],
      ["afternoon", "Yanghwa Hangang Park", 37.540267, 126.899938],
      ["walk", "Gwangjin Rose Park", 37.5695, 127.0752],
    ],
  },
  tokyo: {
    code: "DVnzGTnNT15",
    handle: "svadore",
    places: [
      ["coffee", "Kayaba Coffee", 35.721152, 139.770735],
      ["walk", "Yanaka Ginza", 35.724295, 139.767909],
      ["walk", "Nezu Shrine", 35.719278, 139.764251],
    ],
  },
  toronto: {
    code: "DXcbwyJEWL8",
    handle: "hungryjetlagged",
    places: [
      ["walk", "University College", 43.662834, -79.395169],
      ["walk", "Trinity College", 43.665309, -79.395255],
      ["walk", "Victoria College", 43.666929, -79.391952],
    ],
  },
  chicago: {
    code: "DUzIHJpkgO4",
    handle: "windy_citychicago",
    places: [
      ["dinner", "Olio e Più", 41.890667, -87.62941],
      ["dinner", "Mastro’s Steakhouse", 41.891518, -87.62983],
      ["dinner", "Benihana", 41.899045, -87.623777],
    ],
  },
  seattle: {
    code: "Dec8KinjbOi",
    handle: "chefaz",
    places: [
      ["lunch", "Zax Eat 'N Three", 47.685969, -122.344716],
      ["dinner", "Nirvana", 47.667793, -122.379078],
      ["lunch", "Curbside", 47.649664, -122.357854],
    ],
  },
  austin: {
    code: "Da1LtsNRybN",
    handle: "austinites101",
    places: [
      ["afternoon", "Austin Motel", 30.251748, -97.749094],
      ["morning", "Heritage Boot", 30.246645, -97.751175],
      ["coffee", "Jo's Coffee", 30.251084, -97.749345],
    ],
  },
  dallas: {
    code: "DaDfnSWAgi8",
    handle: "dallasobserver",
    places: [
      ["morning", "Dolly Python", 32.801948, -96.785973],
      ["afternoon", "East Dallas Vintage", 32.798122, -96.778329],
      ["dinner", "Chilangos Tacos", 32.799377, -96.784273],
    ],
  },
  "las-vegas": {
    code: "DK70lVnh7rV",
    handle: "jinaham812",
    places: [
      ["drinks", "The Barbershop Cuts & Cocktails", 36.109651, -115.174567],
      ["drinks", "Ghost Donkey", 36.109749, -115.173893],
      ["dinner", "Secret Pizza", 36.109692, -115.174237],
    ],
  },
  vancouver: {
    code: "CtP_oACA9uV",
    handle: "lifewith.joy_",
    places: [
      ["drinks", "Where Is Bagheera", 49.28004, -123.099469],
      ["drinks", "Laowai", 49.278708, -123.097977],
      ["drinks", "Key Party", 49.264435, -123.101164],
    ],
  },
  montreal: {
    code: "DWy80PCEc1h",
    handle: "travelingmodernprincess",
    places: [
      ["morning", "Château Dufresne", 45.553902, -73.553894],
      ["afternoon", "BAnQ Vieux-Montréal", 45.513273, -73.554652],
      ["walk", "Westmount Conservatory", 45.48102, -73.599474],
    ],
  },
  madrid: {
    code: "CX_4PcDsPGB",
    handle: "derutapormadrid",
    places: [
      [
        "morning",
        "Catedral Ortodoxa de Santa María Magdalena",
        40.467002,
        -3.65145,
      ],
      ["afternoon", "Palacio de Santoña", 40.414019, -3.700365],
      ["walk", "Frontón Beti Jai", 40.430983, -3.691138],
    ],
  },
  berlin: {
    code: "DHPE4AXs7kE",
    handle: "traveller.james",
    places: [
      ["morning", "Schloss Charlottenburg", 52.520642, 13.29271],
      ["afternoon", "Dark Matter", 52.492905, 13.492581],
      ["afternoon", "IKONO Berlin", 52.520495, 13.411215],
    ],
  },
  florence: {
    code: "DZqIudftD-C",
    handle: "talesfromitalia",
    places: [
      ["morning", "Giardino delle Rose", 43.762988, 11.262945],
      ["afternoon", "Biblioteca delle Oblate", 43.772347, 11.259699],
      ["walk", "Basilica di San Miniato al Monte", 43.759432, 11.265143],
    ],
  },
  amsterdam: {
    code: "Deabvz5GiBz",
    handle: "vovvarov",
    places: [
      ["coffee", "LOT61 Coffee Roasters", 52.366834, 4.870291],
      ["afternoon", "Albert Cuyp Markt", 52.355867, 4.895225],
      ["drinks", "Brouwerij 't IJ", 52.366669, 4.92639],
    ],
  },
  rome: {
    code: "DZLI7kxNwhV",
    handle: "romesomuch",
    places: [
      ["morning", "Bagno di Diana", 41.897824, 12.481561],
      ["afternoon", "Palazzo Poli", 41.901199, 12.483356],
      ["walk", "Vicus Caprarius", 41.900431, 12.484095],
    ],
  },
  copenhagen: {
    code: "DZ117fRMKr-",
    handle: "copenview",
    places: [
      ["morning", "Krusemyntegade", 55.688497, 12.584649],
      ["walk", "Landemærket", 55.682717, 12.577555],
      ["afternoon", "Operaparken", 55.680949, 12.600121],
    ],
  },
  milan: {
    code: "DVjtBSrDTD9",
    handle: "svadore",
    places: [
      ["morning", "Pasticceria Leonardo", 45.4688, 9.1714],
      ["walk", "Chiostro delle Rane", 45.4666, 9.1711],
      ["drinks", "Lùbarino", 45.4703, 9.1853],
    ],
  },
};

export function ahaReel(city: SampleCityId): AhaReel {
  return AHA_REELS[city];
}

/** The link a real share from Instagram carries, so the first save is this reel. */
export function ahaReelUrl(reel: AhaReel): string {
  return `https://www.instagram.com/reel/${reel.code}/`;
}
