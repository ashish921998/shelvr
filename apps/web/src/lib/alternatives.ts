import type { Metadata } from "next";

import { pageMetadata } from "@/lib/siteMetadata";

export const ROWS = [
  { key: "platforms", label: "Runs on" },
  { key: "saveFrom", label: "Saves from" },
  { key: "byCity", label: "How places are kept" },
  { key: "trips", label: "Trip plans" },
  { key: "dates", label: "Date-night plans" },
  { key: "together", label: "With friends" },
  { key: "been", label: "Places you’ve been" },
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

const NOT_DESCRIBED = "Not described on its site";
const NOT_IN_HELP = "Not described in Google’s list help";

export const SHELVR_CELLS: Record<Row, string> = {
  platforms: "iPhone. Android is coming",
  saveFrom:
    "Instagram, TikTok, YouTube, Pinterest and X links, from the share sheet",
  byCity: "Every place filed under its city, on a map",
  trips: "1 to 15 days, at the pace you pick, from your saves",
  dates: "Two stops a short walk apart, from your saves",
  together: "Shared lists you add places to together",
  been: "Passport: tick off places and collect cities and countries",
};

const MOVING_FAQ = (name: string) => ({
  q: `Can I move my places from ${name} to Shelvr?`,
  a: `There’s no import from ${name}. Share the reels and TikToks you saved to Shelvr again, and it finds the places in them.`,
});

const ANDROID_FAQ = {
  q: "Is Shelvr on Android?",
  a: "Not yet. Shelvr is on the App Store for iPhone, and Android is coming.",
};

const LOGIN_FAQ = {
  q: "Does Shelvr need my Instagram or TikTok login?",
  a: "No. You share a post from the share sheet, and Shelvr reads the public post.",
};

const PLOTLINE: Alternative = {
  slug: "plotline",
  name: "Plotline",
  summary: "An iPhone app that pins places from social posts and plans trips.",
  title: "Plotline Alternative for Saving Places From Reels | Shelvr",
  description:
    "Shelvr and Plotline both turn reels and TikToks into places on a map. How they differ, and which to pick for trips, date nights and friends.",
  heading: "Shelvr vs Plotline",
  lede: "Both apps read the reels and TikToks you save and pin their places on a map, then plan a trip from them. Here’s where they differ, so you can pick the one that fits how you save.",
  cells: {
    platforms: "iPhone",
    saveFrom:
      "TikTok, Instagram, YouTube and websites from the share sheet; reels sent by DM; Google Maps lists and Apple Maps pins",
    byCity: "Pins on a map, in collections you make",
    trips: "Day-by-day itineraries that group nearby places",
    dates: NOT_DESCRIBED,
    together: "Trips you edit with friends",
    been: NOT_DESCRIBED,
  },
  pickThem: [
    "You want to send reels to it by DM, without leaving Instagram.",
    "You keep places as Apple Maps pins and want them on the same map.",
    "You want a free tier. Plotline’s site says saving, the map and your first trip plan are free.",
  ],
  pickShelvr: [
    "You want a date night planned from your saves, not only trips.",
    "You want a Passport of the places, cities and countries you’ve been.",
    "You keep a list with a partner or friends and want to see who saved what and who went.",
  ],
  faqs: [MOVING_FAQ("Plotline"), LOGIN_FAQ, ANDROID_FAQ],
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
  lede: "Both apps read the TikToks and reels you save and sort their places by city. Here’s where they differ, so you can pick the one that fits how you plan.",
  cells: {
    platforms: "iPhone, Android and the web",
    saveFrom: "TikTok and Instagram links, plus Google Maps links",
    byCity: "Sorted by city, on a map",
    trips: "Plan my day: one day’s order, meal times and walking route",
    dates: NOT_DESCRIBED,
    together: "Trips with friends",
    been: NOT_DESCRIBED,
  },
  pickThem: [
    "You’re on Android, or want to use it in a browser.",
    "You want a free tier. feedtrip’s site describes one with a monthly limit on scans.",
    "You want a tip at every stop of the day it plans.",
  ],
  pickShelvr: [
    "You want a trip of several days planned at once, at the pace you pick.",
    "You want a date night planned from your saves.",
    "You save from YouTube, Pinterest and X as well as TikTok and Instagram.",
    "You want a Passport of the places, cities and countries you’ve been.",
  ],
  faqs: [MOVING_FAQ("feedtrip"), LOGIN_FAQ, ANDROID_FAQ],
  sources: [
    { label: "feedtrip’s website", url: "https://www.feedtrip.app/" },
    {
      label: "feedtrip on Google Play",
      url: "https://play.google.com/store/apps/details?id=com.feedtrip.app",
    },
  ],
};

const REELTRIP: Alternative = {
  slug: "reeltrip",
  name: "ReelTrip",
  summary: "An Android app that turns reels into trips organised by day.",
  title: "ReelTrip Alternative for iPhone | Shelvr",
  description:
    "Shelvr and ReelTrip both turn Instagram reels and TikToks into places for a trip. How they differ, including which one runs on iPhone today.",
  heading: "Shelvr vs ReelTrip",
  lede: "Both apps pull the places out of reels and TikToks and turn them into a trip. Here’s where they differ, starting with the phone you have.",
  cells: {
    platforms: "Android. Its site says iPhone is coming",
    saveFrom:
      "Instagram, TikTok and YouTube links, uploaded videos and carousel images",
    byCity: "Organised by day, with addresses",
    trips: "Places by day, with an optimised route on a map",
    dates: NOT_DESCRIBED,
    together: "Share links",
    been: NOT_DESCRIBED,
  },
  pickThem: [
    "You’re on Android.",
    "You want to upload a video file you’ve already downloaded.",
    "You want the route between stops optimised for you.",
  ],
  pickShelvr: [
    "You have an iPhone and want to start today.",
    "You want a date night planned from your saves, not only trips.",
    "You keep a list with a partner or friends and want to see who saved what and who went.",
    "You want a Passport of the places, cities and countries you’ve been.",
  ],
  faqs: [MOVING_FAQ("ReelTrip"), LOGIN_FAQ, ANDROID_FAQ],
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
  lede: "Both iPhone apps take a reel from the share sheet, find its places and plan days around them. Here’s where they differ.",
  cells: {
    platforms: "iPhone",
    saveFrom: "Instagram and TikTok reels, from the share sheet",
    byCity: "Spots added to a map",
    trips: "A day-by-day itinerary from your saved reels",
    dates: NOT_DESCRIBED,
    together: NOT_DESCRIBED,
    been: NOT_DESCRIBED,
  },
  pickThem: [
    "You want to browse places and itineraries other travelers added.",
    "You want it to search Instagram and TikTok for popular spots you haven’t saved.",
  ],
  pickShelvr: [
    "You want a date night planned from your saves, not only trips.",
    "You keep a list with a partner or friends and want to see who saved what and who went.",
    "You save from YouTube, Pinterest and X as well as reels and TikToks.",
    "You want a Passport of the places, cities and countries you’ve been.",
  ],
  faqs: [MOVING_FAQ("ReelTravel"), LOGIN_FAQ, ANDROID_FAQ],
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
    "Google Maps lists are where most people keep places. How they compare with Shelvr for places you find in reels and TikToks, and when to use both.",
  heading: "Shelvr vs Google Maps lists",
  lede: "A Google Maps list is the default place to keep spots, and it’s already on your phone. Here’s how it compares with Shelvr for the places you find in reels and TikToks.",
  cells: {
    platforms: "Android, iPhone and the web",
    saveFrom: "Places you save in Google Maps",
    byCity: "Lists you name and fill yourself",
    trips: NOT_IN_HELP,
    dates: NOT_IN_HELP,
    together: "Shared lists friends can view or edit",
    been: NOT_IN_HELP,
  },
  pickThem: [
    "You already keep your places there and they’re in good shape.",
    "You’re on Android, or switch between phone and computer.",
    "You want reviews, opening hours and directions in the same app as your list.",
  ],
  pickShelvr: [
    "Most of your places come from reels and TikToks, and you’d rather share the reel and let the app find its places.",
    "You want your saves filed by city without making the lists yourself.",
    "You want a trip or a date night planned from what you saved.",
  ],
  faqs: [
    {
      q: "Can I use Shelvr and Google Maps together?",
      a: "Yes. Use Shelvr to collect the places from your reels and plan with them, and a maps app for directions when you go.",
    },
    LOGIN_FAQ,
    ANDROID_FAQ,
  ],
  sources: [
    {
      label: "Google Maps Help: create a list of places",
      url: "https://support.google.com/maps/answer/7280933",
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

export function alternativeStructuredData(alt: Alternative, site: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: alt.title,
        url: `${site}${alternativePath(alt)}`,
        description: alt.description,
        publisher: { "@type": "Organization", name: "Shelvr" },
      },
      {
        "@type": "FAQPage",
        mainEntity: alt.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
    ],
  };
}
