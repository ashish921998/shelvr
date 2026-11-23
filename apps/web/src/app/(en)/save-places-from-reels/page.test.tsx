import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SavePlacesFromReelsPage, { metadata } from "./page";

describe("the save places from Reels guide", () => {
  it("renders the sharing workflow, example, and related links as page text", () => {
    const html = renderToStaticMarkup(<SavePlacesFromReelsPage />);

    expect(html).toMatch(
      /Open the iPhone share sheet.*Choose Shelvr.*Find the places on your map/,
    );
    expect(html).toContain("Three saves in Prague");
    expect(html).toContain('href="/reel-place-finder"');
    expect(html).toContain('href="/date-night-planner"');
    expect(html).toContain('href="/trip-planner"');
    expect(metadata.alternates?.canonical).toBe("/save-places-from-reels");
  });
});
