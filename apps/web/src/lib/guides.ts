import type { Metadata } from "next";

import { pageMetadata } from "@/lib/siteMetadata";

export type Guide = {
  path: string;
  linkTitle: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lede: string;
  steps: string[];
  sections: { heading: string; body: string }[];
  faqs: { q: string; a: string }[];
};

const ANDROID_FAQ = {
  q: "Is Shelvr on Android?",
  a: "Not yet. Shelvr is on the App Store for iPhone, and Android is coming.",
};

export const INSTAGRAM_REELS: Guide = {
  path: "/save-instagram-reels-to-map",
  linkTitle: "Save Instagram reels to a map",
  title: "How to Save Places From Instagram Reels to a Map | Shelvr",
  description:
    "Share an Instagram reel to Shelvr and the restaurants, cafés and sights it names are pinned on a map of their city, ready for when you go.",
  eyebrow: "Instagram reels",
  heading: "Save the places in Instagram reels to a map",
  lede: "Instagram’s Saved tab keeps the reel, not the place. Share the reel to Shelvr instead, and the spots it names land on a map of their city, next to the reel they came from.",
  steps: [
    "On the reel, tap Share and open the iPhone share sheet.",
    "Pick Shelvr. The first time, you may need to add it from More.",
    "Shelvr reads the reel and files each place it names under its city.",
    "Open the city to see them on a map, or plan a date or a trip around them.",
  ],
  sections: [
    {
      heading: "Why the Saved tab isn’t enough",
      body: "Saved collections keep posts in the order you saved them. There’s no map, and no way to see everything you saved for one city. By the time you book the trip, the bar you meant to try is forty reels down.",
    },
    {
      heading: "What Shelvr does with a reel",
      body: "It finds the restaurants, cafés, bars, shops and sights the reel names and files them under their city. Each place keeps the reel it came from, so you can rewatch why you saved it.",
    },
    {
      heading: "When you get there",
      body: "Open the city and every place you saved is on one map. Tick off the ones you’ve been to, then ask Shelvr for a date night or a day-by-day trip built from the rest.",
    },
  ],
  faqs: [
    {
      q: "Can I save the places in a reel to Google Maps?",
      a: "Instagram has no button for it, so you’d copy each name into Google Maps by hand. Shelvr finds the places for you and keeps them on its own map, filed by city.",
    },
    {
      q: "Do I need to give Shelvr my Instagram login?",
      a: "No. You share the reel from the share sheet, and Shelvr reads the public post. Private posts can’t be read.",
    },
    {
      q: "What if the reel never names a place?",
      a: "The save stays in Shelvr, marked “No place in this one”, so you know to check the comments, where creators often pin the list.",
    },
    {
      q: "Can I try it without the app?",
      a: "Yes. Paste a reel’s link into the free reel place finder on this site to see the places it names.",
    },
    ANDROID_FAQ,
  ],
};

export const TIKTOK_PLACES: Guide = {
  path: "/save-tiktok-places-to-map",
  linkTitle: "Save TikTok places to a map",
  title: "How to Save Places From TikTok to a Map | Shelvr",
  description:
    "Share a TikTok to Shelvr and the restaurants, cafés and sights in it are pinned on a map of their city, so your favorites turn into places you can go.",
  eyebrow: "TikTok",
  heading: "Save the places in TikToks to a map",
  lede: "TikTok Favorites keep the video, and the restaurant’s name is somewhere in the caption. Share the TikTok to Shelvr, and the places it names land on a map of their city.",
  steps: [
    "On the TikTok, tap Share, then open the iPhone share sheet.",
    "Pick Shelvr. The first time, you may need to add it from More.",
    "Shelvr reads the TikTok and files each place it names under its city.",
    "Open the city to see them on a map, or plan a date or a trip around them.",
  ],
  sections: [
    {
      heading: "Favorites are a feed, not a map",
      body: "TikTok keeps your favorites as a grid of videos. Finding the ramen spot from last spring means scrolling until you see the thumbnail, then reading the caption for its name.",
    },
    {
      heading: "What Shelvr does with a TikTok",
      body: "It finds the places the TikTok names and files them under their city, with the video kept alongside, so the reason you saved it is a tap away.",
    },
    {
      heading: "One map for every app",
      body: "Reels, TikToks and YouTube videos all land on the same map. Open a city and everything you saved for it is there, whichever app you found it in.",
    },
  ],
  faqs: [
    {
      q: "Can I save TikTok places to Google Maps?",
      a: "TikTok has no export, so you’d copy each name into Google Maps by hand. Shelvr finds the places for you and keeps them on its own map, filed by city.",
    },
    {
      q: "Do I need to give Shelvr my TikTok login?",
      a: "No. You share the TikTok from the share sheet, and Shelvr reads the public post. Private videos can’t be read.",
    },
    {
      q: "What if the TikTok never names a place?",
      a: "The save stays in Shelvr, marked “No place in this one”, so you know to check the comments.",
    },
    {
      q: "Can I try it without the app?",
      a: "Yes. Paste a TikTok link into the free reel place finder on this site to see the places it names.",
    },
    ANDROID_FAQ,
  ],
};

export const TRIP_FROM_REELS: Guide = {
  path: "/plan-a-trip-from-saved-reels",
  linkTitle: "Plan a trip from saved reels",
  title: "Turn Saved Reels and TikToks Into a Trip Plan | Shelvr",
  description:
    "Shelvr pins the places from the reels and TikToks you saved, then plans your trip day by day around them, one area a day, morning to evening.",
  eyebrow: "Trip planning",
  heading: "Turn the reels you saved into a trip plan",
  lede: "You’ve saved forty reels about one city. Shelvr pins their places on a map, then plans your days around them.",
  steps: [
    "Share the reels and TikToks you saved about a city to Shelvr.",
    "Open the city in Shelvr and tap Plan a trip.",
    "Pick how many days, a start date if you have one, and a pace: easy, balanced or packed.",
    "Get one area a day, morning to evening. Move or remove any stop, or add your own.",
  ],
  sections: [
    {
      heading: "Built from what you saved",
      body: "A travel guide gives everyone the same list. Shelvr starts from the places you saved, then fills the gaps with suggested spots nearby.",
    },
    {
      heading: "Days that make sense on a map",
      body: "Each day keeps to one or two neighborhoods, so you aren’t crossing the city between lunch and coffee. Tap a saved stop to open the reel it came from.",
    },
    {
      heading: "Plan again after you go",
      body: "Tick off the places you’ve been, and the next plan picks something new.",
    },
  ],
  faqs: [
    {
      q: "How long a trip can Shelvr plan?",
      a: "From one day up to fifteen.",
    },
    {
      q: "Does it book hotels or flights?",
      a: "No. Shelvr plans where to go from what you saved. It doesn’t book anything.",
    },
    {
      q: "What if I haven’t saved much for the city?",
      a: "Shelvr adds suggested spots near your saves. If a day still has nothing that fits, it says so, and planning again after a few more saves fills it in.",
    },
    ANDROID_FAQ,
  ],
};

export const DATE_FROM_SAVES: Guide = {
  path: "/plan-a-date-from-saved-places",
  linkTitle: "Plan a date from saved places",
  title: "Date Night Ideas From the Places You Saved | Shelvr",
  description:
    "Shelvr turns the restaurants and bars you saved from reels and TikToks into a date night: two stops a short walk apart, ready to send to your date.",
  eyebrow: "Date night",
  heading: "Plan a date night from the places you saved",
  lede: "You’ve saved the wine bar and the dumpling place, and you still end up asking “where should we go?”. Shelvr picks an evening from your saves.",
  steps: [
    "Share the reels and TikToks with places you want to try to Shelvr.",
    "Open your city in Shelvr and tap Plan a date.",
    "Pick classic (dinner, then drinks or dessert), low-key (coffee, then a walk) or surprise me.",
    "Get two stops a short walk apart, then send the plan to your date.",
  ],
  sections: [
    {
      heading: "From your list, not a ranking",
      body: "Shelvr picks from the places you already wanted to try, so the evening feels like yours, not the top of a search result.",
    },
    {
      heading: "Two stops, a short walk apart",
      body: "Dinner and a bar on opposite sides of town isn’t a plan. Shelvr pairs places close enough to walk between and tells you how long the walk is.",
    },
    {
      heading: "Something new next time",
      body: "Tick off the places you’ve been, and the next date picks somewhere new.",
    },
  ],
  faqs: [
    {
      q: "What kinds of date can it plan?",
      a: "Classic is dinner, then drinks or dessert. Low-key is coffee, then a walk. Surprise me picks whichever your saves can make.",
    },
    {
      q: "Does it make reservations?",
      a: "No. Shelvr picks where to go and gives you directions to the first stop. Booking a table is up to you.",
    },
    ANDROID_FAQ,
  ],
};

export const GUIDES = [
  INSTAGRAM_REELS,
  TIKTOK_PLACES,
  TRIP_FROM_REELS,
  DATE_FROM_SAVES,
] as const;

export function guideMetadata(page: Guide): Metadata {
  return {
    ...pageMetadata(page.path, page.title, page.description),
    twitter: {
      card: "summary",
      title: page.title,
      description: page.description,
    },
  };
}

export function guideStructuredData(page: Guide, site: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: page.title,
        url: `${site}${page.path}`,
        description: page.description,
        publisher: { "@type": "Organization", name: "Shelvr" },
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: { "@type": "Answer", text: faq.a },
        })),
      },
    ],
  };
}
