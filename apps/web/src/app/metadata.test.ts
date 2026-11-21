import { describe, expect, it } from "vitest";

import { generateMetadata as alternativeMetadata } from "./alternatives/[app]/page";
import { metadata as alternativesHub } from "./alternatives/page";
import { metadata as layout } from "./layout";
import { metadata as home } from "./page";
import { metadata as dateGuide } from "./plan-a-date-from-saved-places/page";
import { metadata as tripGuide } from "./plan-a-trip-from-saved-reels/page";
import { metadata as privacy } from "./privacy/page";
import { metadata as reelsGuide } from "./save-instagram-reels-to-map/page";
import { metadata as tiktokGuide } from "./save-tiktok-places-to-map/page";
import { metadata as support } from "./support/page";
import { metadata as terms } from "./terms/page";

describe("site metadata", () => {
  // A page without its own alternates or openGraph inherits the layout's whole object.
  it("leaves the canonical and og:url out of the root layout", () => {
    expect(layout.alternates).toBeUndefined();
    expect(layout.openGraph).not.toHaveProperty("url");
  });

  it.each([
    ["/", home],
    ["/terms", terms],
    ["/privacy", privacy],
    ["/support", support],
    ["/save-instagram-reels-to-map", reelsGuide],
    ["/save-tiktok-places-to-map", tiktokGuide],
    ["/plan-a-trip-from-saved-reels", tripGuide],
    ["/plan-a-date-from-saved-places", dateGuide],
    ["/alternatives", alternativesHub],
  ])("gives %s its own canonical and og:url", (path, metadata) => {
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.openGraph).toMatchObject({
      url: path,
      title: metadata.title,
      description: metadata.description,
    });
  });

  it("gives each comparison its own canonical and og:url", async () => {
    const metadata = await alternativeMetadata({
      params: Promise.resolve({ app: "plotline" }),
    });
    expect(metadata.alternates?.canonical).toBe("/alternatives/plotline");
    expect(metadata.openGraph).toMatchObject({ url: "/alternatives/plotline" });
  });
});
