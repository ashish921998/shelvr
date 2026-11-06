import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicMap, PublicMapOutcome } from "@/lib/publicMap";

const mocks = vi.hoisted(() => ({
  result: { outcome: "found" } as {
    outcome: PublicMapOutcome;
    map?: PublicMap;
  },
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": mocks.userAgent }),
}));
vi.mock("@/lib/publicMap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicMap")>()),
  loadPublicMap: async () => mocks.result,
}));
vi.mock("@/components/common/Logo", () => ({ default: () => null }));

import PublicMapPage, { generateMetadata } from "./page";

const TOKEN = "0123456789abcdef0123456789abcdef";

const mexicoCity = {
  city: "Mexico City",
  places: [
    {
      name: "Contramar",
      lat: 19.419,
      lng: -99.166,
      emoji: "🍽️",
      went: true,
      post: {
        site: "instagram" as const,
        url: "https://www.instagram.com/reel/DFixtureMx1/",
      },
    },
    { name: "Café Avellaneda", lat: 19.348, lng: -99.162, went: false },
  ],
};

const austin = {
  city: "Austin",
  places: [{ name: "Jo's Coffee", lat: 30.25, lng: -97.749, went: false }],
};

async function render(): Promise<string> {
  return renderToStaticMarkup(
    await PublicMapPage({ params: Promise.resolve({ token: TOKEN }) }),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

beforeEach(() => {
  mocks.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  mocks.result = {
    outcome: "found",
    map: { ownerName: "Ashish", cities: [mexicoCity, austin], saveAll: false },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("map page metadata", () => {
  it("points its canonical and og:url at the map page and stays out of search", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(metadata.title).toBe("Ashish’s map — Shelvr");
    expect(metadata.alternates?.canonical).toBe(`/m/${TOKEN}`);
    expect(metadata.openGraph?.url).toBe(`/m/${TOKEN}`);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("map page", () => {
  it("shows the owner's map: counters, legend, cities, links, the call to action and the report line", async () => {
    const html = await render();
    const page = text(html);
    expect(page).toContain("Ashish’s map");
    expect(page).toContain("2 cities");
    expect(page).toContain("3 places");
    expect(page).toContain("1 been there");
    expect(page).toContain("Want to go");
    expect(page).toContain("2 places · 1 been there");
    expect(page).toContain("1 place ");
    expect(page.indexOf("Mexico City")).toBeLessThan(page.indexOf("Austin"));
    expect(html).toContain(
      'href="https://www.instagram.com/reel/DFixtureMx1/"',
    );
    expect(html).toContain('rel="noopener noreferrer ugc"');
    expect(html).toContain(
      'href="https://maps.apple.com/?q=Caf%C3%A9%20Avellaneda&amp;ll=19.348,-99.162"',
    );
    expect(page).toContain("Make your own map");
    expect(html).toContain('aria-label="Download Shelvr on the App Store"');
    expect(page).toContain("Report this page");
    expect(html).toContain(
      encodeURIComponent(`Report Shelvr map page /m/${TOKEN}`),
    );
  });

  it("leaves out Been there everywhere when the owner has no marks", async () => {
    mocks.result = {
      outcome: "found",
      map: { cities: [austin], saveAll: false },
    };
    const page = text(await render());
    expect(page).toContain("A Shelvr map");
    expect(page).toContain("1 city");
    expect(page).not.toContain("been there");
    expect(page).not.toContain("Been there");
    expect(page).not.toContain("Want to go");
  });

  it("says the map has no places when every city lost them", async () => {
    mocks.result = {
      outcome: "found",
      map: { ownerName: "Ashish", cities: [], saveAll: false },
    };
    const page = text(await render());
    expect(page).toContain("Ashish’s map");
    expect(page).toContain("No places on this map yet.");
    expect(page).not.toContain(" cities ");
    expect(page).toContain("Report this page");
  });

  it("lets a long owner or city name wrap instead of widening the page", async () => {
    const owner = "Maximilianbartholomewalexandersson";
    const city = "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch";
    mocks.result = {
      outcome: "found",
      map: { ownerName: owner, cities: [{ ...austin, city }], saveAll: false },
    };
    const html = await render();
    expect(html).toMatch(
      new RegExp(
        `<h1 class="[^"]*\\[overflow-wrap:anywhere\\][^"]*">${owner}’s map</h1>`,
      ),
    );
    expect(html).toMatch(
      new RegExp(
        `<h2 [^>]*class="[^"]*\\[overflow-wrap:anywhere\\][^"]*">${city}</h2>`,
      ),
    );
  });

  it("tells a dead link from one that did not load", async () => {
    mocks.result = { outcome: "missing" };
    let page = text(await render());
    expect(page).toContain("This map isn’t shared anymore");
    expect(page).toContain("Ask for a new link.");
    expect(page).toContain("Make your own map");
    expect(page).toContain("Report this page");

    mocks.result = { outcome: "unavailable" };
    page = text(await render());
    expect(page).toContain("This map didn’t load");
    expect(page).toContain("Try again in a moment.");
    expect(page).toContain("Make your own map");
    expect(page).not.toContain("Report this page");
  });

  it("offers Android visitors the waitlist and Google Maps", async () => {
    mocks.userAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
    const html = await render();
    expect(html).not.toContain("Download Shelvr on the App Store");
    expect(html).toContain("android-waitlist-email");
    expect(html).toContain(
      "https://www.google.com/maps/search/?api=1&amp;query=Caf%C3%A9%20Avellaneda%2C%20Mexico%20City",
    );
  });
});

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTALL_HINT =
  "New to Shelvr? Install it, then come back to this page and tap Save all. If Shelvr opens on Home instead, update it from the App Store.";
const DESKTOP_LINE =
  "Open this page on your iPhone to save these places to Shelvr.";

describe("map page with Save all", () => {
  beforeEach(() => {
    mocks.userAgent = IPHONE;
    mocks.result = {
      outcome: "found",
      map: { ownerName: "Ashish", cities: [mexicoCity, austin], saveAll: true },
    };
  });

  it("puts a Save all panel with a button per city above the first city on an iPhone", async () => {
    const html = await render();
    const page = text(html);
    expect(html.indexOf("Save this map to Shelvr")).toBeGreaterThan(-1);
    expect(html.indexOf("Save this map to Shelvr")).toBeLessThan(
      html.indexOf(">Mexico City</h2>"),
    );
    expect(page).toContain(
      "Each city you save becomes a list in your Shelvr, with links to the posts its places came from.",
    );
    expect(html.match(/creatorMap=/g)).toHaveLength(2);
    expect(html).toContain(
      `href="shelvr:///?creatorMap=${TOKEN}&amp;city=Mexico%20City"`,
    );
    expect(html).toContain(
      `href="shelvr:///?creatorMap=${TOKEN}&amp;city=Austin"`,
    );
    expect(page.indexOf("Save Mexico City to Shelvr")).toBeLessThan(
      page.indexOf("Save Austin to Shelvr"),
    );
    expect(page).toContain(INSTALL_HINT);
    expect(page).not.toContain(DESKTOP_LINE);
    expect(html.match(/Download Shelvr on the App Store/g)).toHaveLength(2);
  });

  it("says Save all for a one-city map", async () => {
    mocks.result = {
      outcome: "found",
      map: { ownerName: "Ashish", cities: [mexicoCity], saveAll: true },
    };
    const page = text(await render());
    expect(page).toContain(
      "The places go into a list in your Shelvr, with links to the posts they came from.",
    );
    expect(page).toContain("Save all to Shelvr");
    expect(page).not.toContain("Save Mexico City to Shelvr");
  });

  it("links to the development app when the scheme says so", async () => {
    vi.stubEnv("APP_LINK_SCHEME", "shelvr-dev");
    const html = await render();
    expect(html).toContain(
      `href="shelvr-dev:///?creatorMap=${TOKEN}&amp;city=Mexico%20City"`,
    );
    expect(html).not.toContain('href="shelvr:///');
  });

  it("asks in-app browser visitors to open the page in their browser first", async () => {
    mocks.userAgent = `${IPHONE} Instagram 350.0.0.0.0`;
    const page = text(await render());
    expect(page).toContain(
      "In Instagram, tap ••• up top, then Open in browser, and tap Save all there.",
    );
    expect(page).not.toContain(INSTALL_HINT);
  });

  it("asks a computer to open the page on an iPhone, with no Save all link", async () => {
    mocks.userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const html = await render();
    const page = text(html);
    expect(page).toContain("Save this map to Shelvr");
    expect(page).toContain(DESKTOP_LINE);
    expect(html).not.toContain("creatorMap=");
    expect(page).not.toContain(INSTALL_HINT);
  });

  it("shows no panel on Android", async () => {
    mocks.userAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
    const html = await render();
    expect(html).not.toContain("Save this map to Shelvr");
    expect(html).not.toContain("creatorMap=");
  });

  it("shows no panel with Save all off or no places", async () => {
    mocks.result = {
      outcome: "found",
      map: {
        ownerName: "Ashish",
        cities: [mexicoCity, austin],
        saveAll: false,
      },
    };
    let html = await render();
    expect(html).not.toContain("Save this map to Shelvr");
    expect(html).not.toContain("creatorMap=");

    mocks.result = {
      outcome: "found",
      map: { ownerName: "Ashish", cities: [], saveAll: true },
    };
    html = await render();
    expect(text(html)).toContain("No places on this map yet.");
    expect(html).not.toContain("Save this map to Shelvr");
  });

  it("asks link previews to save the places", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(metadata.description).toBe(
      "Mexico City and Austin: 3 places, 1 been there. Save them all to Shelvr.",
    );
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });
});
