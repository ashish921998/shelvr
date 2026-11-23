import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import TripPlannerPage, { metadata } from "./page";

describe("the trip planner page", () => {
  it("renders the itinerary, app requirement, and related guide as page text", () => {
    const html = renderToStaticMarkup(<TripPlannerPage />);

    expect(html).toContain("Plan a trip from places you saved");
    expect(html).toContain("Personal trip planning requires Shelvr Pro.");
    expect(html).toContain("tap Plan a trip, then Generate an itinerary");
    expect(html).toMatch(
      /Example day in Lisbon.*Miradouro da Graça.*Time Out Market.*LX Factory.*Pastéis de Belém/,
    );
    expect(html).toContain('href="https://apps.apple.com/app/id6798143550"');
    expect(html).toContain('href="/save-places-from-reels"');
    expect(metadata.alternates?.canonical).toBe("/trip-planner");
    expect(metadata.twitter?.title).toBe(metadata.title);
  });
});
