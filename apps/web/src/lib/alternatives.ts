import type { Metadata } from "next";

import { pageMetadata } from "@/lib/siteMetadata";

export const ROWS = [
  { key: "platforms", label: "Runs on" },
  { key: "saveFrom", label: "Saves from" },
  { key: "byCity", label: "How places are kept" },
  { key: "trips", label: "Trip plans" },
  { key: "dates", label: "Date-night plans" },
  { key: "together", label: "With friends" },
] as const;

type Row = (typeof ROWS)[number]["key"];

export type Alternative = {
  slug: string;
  name: string;
  summary: string;
  title: string;
  description: string;
  heading: string;
  lede: string;
  cells: Record<Row, string>;
  pickThem: string[];
  pickShelvr: string[];
  faqs: { q: string; a: string }[];
  sources: { label: string; url: string }[];
};

export const CHECKED = "November 2026";

const UNSPECIFIED = "—";

export const SHELVR_CELLS: Record<Row, string> = {
  platforms: "iPhone",
  saveFrom:
    "Links from Instagram, TikTok, YouTube, Pinterest and X, plus shared Google Maps lists",
  byCity: "Places Shelvr finds are pinned on a map of their city",
  trips: "Day-by-day plans for 1 to 15 days, at the pace you pick",
  dates: "Two stops a short walk apart, including at least one saved place",
  together:
    "Shared lists where everyone can add places and use them to make a plan",
};

const PLOTLINE: Alternative = {
  slug: "plotline",
  name: "Plotline",
  summary: "An iPhone app that pins places from social posts and plans trips.",
  title: "Plotline Alternative for Saving Places From Reels | Shelvr",
  description:
    "Shelvr and Plotline both turn reels and TikToks into places on a map. How they differ, and which to pick for trips, date nights and friends.",
  heading: "Shelvr vs Plotline",
  lede: "Plotline and Shelvr both pin places from Instagram Reels and TikToks and build trips from your saves. Plotline supports saving Reels by Instagram DM and live trip editing. Shelvr can plan a two-stop date from places you’ve saved.",
  cells: {
    platforms: "iPhone",
    saveFrom:
      "TikTok, Instagram, YouTube, travel blogs, Google Maps lists and Apple Maps pins. Reels by DM after connecting Instagram.",
    byCity: "Pins on a map, in collections you make",
    trips: "Routed itineraries for 1 to 14 days, with an optional home base",
    dates: UNSPECIFIED,
    together: "Trips you edit with friends",
  },
  pickThem: [
    "You want to connect Instagram and save Reels by DM.",
    "You keep places as Apple Maps pins and want them on the same map.",
    "You want a free tier. Plotline’s site says saving, the map and your first trip plan are free.",
  ],
  pickShelvr: [
    "You want to turn your saved restaurants and bars into a two-stop date.",
    "You keep an ongoing list of places to try with a partner or friends.",
  ],
  faqs: [
    {
      q: "Can I bring over a Google Maps list?",
      a: "Both apps accept shared Google Maps lists. In Google Maps, open the list, tap Share and choose the app you want to send it to.",
    },
  ],
  sources: [
    { label: "Plotline’s website", url: "https://getplotline.app/" },
    { label: "Plotline’s FAQ", url: "https://getplotline.app/faq" },
  ],
};

const FEEDTRIP: Alternative = {
  slug: "feedtrip",
  name: "feedtrip",
  summary: "A TikTok and Instagram place saver on iPhone, Android and the web.",
  title: "feedtrip Alternative for Saving TikTok Places | Shelvr",
  description:
    "Shelvr and feedtrip both pin the places in TikToks and reels on a map, sorted by city. How they differ on platforms, plans and friends.",
  heading: "Shelvr vs feedtrip",
  lede: "feedtrip and Shelvr both put places from Reels and TikToks on a city map. feedtrip works in a browser and can plan a day’s walk. Shelvr builds multi-day trips and two-stop date plans on iPhone.",
  cells: {
    platforms: "iPhone, Android and the web",
    saveFrom: "TikTok and Instagram links, plus Google Maps links",
    byCity: "Sorted by city, on a map",
    trips: "Plan my day arranges stops, meal times and a walking route",
    dates: UNSPECIFIED,
    together: "Join friends’ trips, with invitations included in paid plans",
  },
  pickThem: [
    "You’re on Android, or want to use it in a browser.",
    "You want a free tier. feedtrip’s site describes one with a monthly limit on scans.",
  ],
  pickShelvr: [
    "You want a trip of several days planned at once, at the pace you pick.",
    "You want a date night planned from your saves.",
    "You save from YouTube, Pinterest and X as well as TikTok and Instagram.",
  ],
  faqs: [
    {
      q: "How does feedtrip look up a place in a video?",
      a: "feedtrip says it uses the caption, audio and on-screen text to look for places in a public video.",
    },
  ],
  sources: [
    { label: "feedtrip’s website", url: "https://www.feedtrip.app/" },
    {
      label: "feedtrip’s FAQ",
      url: "https://www.feedtrip.app/faq",
    },
  ],
};

const REELTRIP: Alternative = {
  slug: "reeltrip",
  name: "ReelTrip",
  summary: "An Android and web planner for trips from video links or uploads.",
  title: "ReelTrip Alternative for iPhone | Shelvr",
  description:
    "Shelvr and ReelTrip both turn Instagram reels and TikToks into places for a trip. How they differ, including which one runs on iPhone today.",
  heading: "Shelvr vs ReelTrip",
  lede: "ReelTrip turns a link or video upload into a mapped itinerary on Android and the web. Shelvr saves places under their cities and builds date or trip plans around those saves on iPhone.",
  cells: {
    platforms: "Android and web (Pro). ReelTrip lists iPhone as coming soon.",
    saveFrom:
      "Instagram, TikTok and YouTube links, uploaded videos, carousel images and KML from Google Maps",
    byCity: "Stops grouped by day, with addresses",
    trips: "Places by day, with a suggested route on a map",
    dates: UNSPECIFIED,
    together: "Share a trip by link",
  },
  pickThem: [
    "You’re on Android or want to plan in a browser with ReelTrip Pro.",
    "You want to upload a video file you’ve already downloaded.",
    "You want the route between stops optimized for you.",
  ],
  pickShelvr: [
    "You use an iPhone and like sharing links from the iOS share sheet.",
    "You want a date night planned from your saved places.",
    "You collect places with a partner or friends in a shared list.",
  ],
  faqs: [
    {
      q: "How do the Google Maps imports work?",
      a: "ReelTrip lists KML import in its Android app. In Shelvr, share the link to a Google Maps list to file its places by city.",
    },
  ],
  sources: [
    { label: "ReelTrip’s website", url: "https://reeltrip.app/" },
    {
      label: "ReelTrip on Google Play",
      url: "https://play.google.com/store/apps/details?id=com.reeltripapp.reeltrip",
    },
  ],
};

const REELTRAVEL: Alternative = {
  slug: "reeltravel",
  name: "ReelTravel",
  summary:
    "An iPhone app that maps reels and builds itineraries, with community picks.",
  title: "ReelTravel Alternative for Saving Places From Reels | Shelvr",
  description:
    "Shelvr and ReelTravel both turn Instagram reels and TikToks into places on a map and a day-by-day plan. How they differ, and which to pick.",
  heading: "Shelvr vs ReelTravel",
  lede: "ReelTravel and Shelvr both take Reels and TikToks from the iPhone share sheet and turn the places into trip ideas. ReelTravel adds community itineraries. Shelvr also uses your saves for two-stop date plans.",
  cells: {
    platforms: "iPhone",
    saveFrom: "Instagram and TikTok reels, from the share sheet",
    byCity: "Mapped places in city folders with links to the original videos",
    trips: "Day-by-day plans from saved Reels and suggested social spots",
    dates: UNSPECIFIED,
    together: UNSPECIFIED,
  },
  pickThem: [
    "You want to browse places and itineraries other travelers added.",
    "You want it to search Instagram and TikTok for popular spots you haven’t saved.",
  ],
  pickShelvr: [
    "You want to turn your saved places into a date plan.",
    "You and a partner want to add places to the same list.",
    "You save from YouTube, Pinterest and X as well as reels and TikToks.",
  ],
  faqs: [
    {
      q: "Where do the planners get extra stops?",
      a: "ReelTravel’s App Store listing says it searches Instagram and TikTok. Shelvr can suggest places from Apple Maps when your own saves leave gaps in a trip.",
    },
  ],
  sources: [
    {
      label: "ReelTravel on the App Store",
      url: "https://apps.apple.com/us/app/reeltravel-trips-from-reels/id6755888482",
    },
  ],
};

const GOOGLE_MAPS_LISTS: Alternative = {
  slug: "google-maps-lists",
  name: "Google Maps lists",
  summary: "The saved lists built into Google Maps.",
  title: "Google Maps Saved Lists vs Shelvr for Places From Reels",
  description:
    "Compare Google Maps saved lists with Shelvr for places you find in Reels and TikToks. See how both apps can fit into one trip.",
  heading: "Shelvr vs Google Maps lists",
  lede: "Google Maps lists keep chosen places together with reviews and directions. Shelvr starts with the videos you save and files the places it finds by city. You can also share a Google Maps list into Shelvr to use its places in a plan.",
  cells: {
    platforms: "Android, iPhone and the web",
    saveFrom:
      "Places you save in Maps and, in some regions on iPhone and iPad, places found in screenshots",
    byCity: "Lists you name and fill yourself",
    trips: "A Travel plans list for saving stops",
    dates: UNSPECIFIED,
    together: "Shared lists friends can view or edit",
  },
  pickThem: [
    "You keep your places in lists on both your phone and computer.",
    "You want reviews, opening hours and directions in the same app as your list.",
    "You use Google Maps Timeline to revisit past trips.",
  ],
  pickShelvr: [
    "Most of your places come from reels and TikToks, and you’d rather share the reel and let the app find its places.",
    "You want your saves filed by city without making the lists yourself.",
    "You want a trip or a date night planned from what you saved.",
  ],
  faqs: [
    {
      q: "Can I use Shelvr and Google Maps together?",
      a: "Use Google Maps to keep a list you can open on several devices. Share the list with Shelvr to add its places to your city maps and plan a date or trip on iPhone.",
    },
  ],
  sources: [
    {
      label: "Google Maps lists",
      url: "https://support.google.com/maps/answer/7280933",
    },
    {
      label: "Saving places from screenshots",
      url: "https://support.google.com/maps/answer/16278054",
    },
    {
      label: "Google Maps Timeline",
      url: "https://support.google.com/maps/answer/6258979",
    },
  ],
};

export const ALTERNATIVES = [
  PLOTLINE,
  FEEDTRIP,
  REELTRIP,
  REELTRAVEL,
  GOOGLE_MAPS_LISTS,
] as const;

export const HUB_PATH = "/alternatives";
export const HUB_TITLE = "Apps to Save Places From Reels, Compared | Shelvr";
export const HUB_DESCRIPTION =
  "How Shelvr compares with Plotline, feedtrip, ReelTrip, ReelTravel and Google Maps lists for keeping the places you find in reels and TikToks.";

export function alternativePath(alt: Alternative): string {
  return `${HUB_PATH}/${alt.slug}`;
}

export function findAlternative(slug: string): Alternative | undefined {
  return ALTERNATIVES.find((alt) => alt.slug === slug);
}

export function alternativeMetadata(alt: Alternative): Metadata {
  return {
    ...pageMetadata(alternativePath(alt), alt.title, alt.description),
    twitter: {
      card: "summary",
      title: alt.title,
      description: alt.description,
    },
  };
}
