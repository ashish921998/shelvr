import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    map: { ownerName: "Ashish", cities: [mexicoCity, austin] },
  };
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
    mocks.result = { outcome: "found", map: { cities: [austin] } };
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
      map: { ownerName: "Ashish", cities: [] },
    };
    const page = text(await render());
    expect(page).toContain("Ashish’s map");
    expect(page).toContain("No places on this map yet.");
    expect(page).not.toContain(" cities ");
    expect(page).toContain("Report this page");
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
