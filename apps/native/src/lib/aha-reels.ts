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
    code: "DNI_eJoxciy",
    handle: "camberplaces",
    places: [
      ["drinks", "Zizou", 34.074097, -118.215726],
      ["dinner", "Rasarumah", 34.071976, -118.282317],
      ["brunch", "Linden", 34.097958, -118.319243],
    ],
  },
  "new-york": {
    code: "DXXpR7DhOm5",
    handle: "secret_nyc",
    places: [
      ["lunch", "Footprints Cafe", 40.575747, -73.983238],
      ["afternoon", "Film Noir Cinema", 40.727314, -73.951608],
      ["coffee", "Thrift N' Sip", 40.700925, -73.826755],
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
      ["coffee", "Kayaba Coffee", 35.721146, 139.770771],
      ["afternoon", "Nennekoya", 35.720746, 139.766069],
      ["lunch", "Kamachiku", 35.718083, 139.766998],
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
    code: "DLlHb3RvIjy",
    handle: "biancaalbamph",
    places: [
      [
        "morning",
        "International Museum of Surgical Science",
        41.910153,
        -87.62694,
      ],
      ["walk", "The Magic Hedge", 41.962992, -87.63317],
      ["afternoon", "Merz Apothecary", 41.967071, -87.687687],
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
    code: "Com2fwCDNnZ",
    handle: "512bites",
    places: [
      ["dinner", "Lima Criolla", 30.324796, -97.707735],
      ["lunch", "Uncle Nicky's", 30.247654, -97.771921],
      ["dinner", "Vic & Al's", 30.284928, -97.717],
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
    code: "DPuKyjqEWCT",
    handle: "immarcomurillo",
    places: [
      ["drinks", "The Lock Speakeasy", 36.113482, -115.169055],
      ["dessert", "The Speakeasy at Caramella", 36.110062, -115.171513],
      ["dinner", "Caspian's Rock & Roe", 36.116628, -115.176757],
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
    code: "DcB6IefAcnh",
    handle: "visita_madrid",
    places: [
      ["coffee", "La Terraza del Campo del Moro", 40.418981, -3.719612],
      ["dessert", "Las Carboneras", 40.414693, -3.70995],
      ["walk", "Travesía del Nuncio", 40.413427, -3.710202],
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
    code: "DTQmXZUgPAA",
    handle: "cosmoiscosmic",
    places: [
      ["morning", "Kalverstraat carillon", 52.369883, 4.891307],
      ["coffee", "Het Kleinste Huis", 52.371235, 4.897672],
      ["walk", "Rokin metro archaeology display", 52.370533, 4.89267],
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
