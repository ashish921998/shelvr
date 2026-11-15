import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ClosingPanel from "./ClosingPanel";
import Hero from "./Hero";
import Plans from "./Plans";
import ProblemProof from "./ProblemProof";

const UNSHIPPED_VISITS = [/visited/i, /\bbeen\b/i, /want to go/i];

function expectInOrder(markup: string, parts: string[]) {
  const positions = parts.map((part) => markup.indexOf(part));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

describe("landing hero", () => {
  const markup = renderToStaticMarkup(<Hero />);

  it("shows the sample city as one labelled image", () => {
    expect(markup).toMatch(
      /<svg[^>]*role="img"[^>]*aria-label="A sample Lisbon map in Shelvr: 23 places from your saves"/,
    );
    expect(markup).not.toContain("app-reel.jpg");
  });

  it("draws the city page's sheet and plan bar, then the button", () => {
    for (const text of [
      "23 places from your saves",
      "Plan a date",
      "One evening, a few stops",
      "Plan a trip",
      "Day by day",
      "Map my saves",
      "On the App Store, for iPhone.",
    ]) {
      expect(markup).toContain(text);
    }
  });

  it("claims no visits or plan counts the app does not show", () => {
    for (const pattern of [...UNSHIPPED_VISITS, /\d+ plans/]) {
      expect(markup).not.toMatch(pattern);
    }
  });
});

describe("problem, then proof", () => {
  const markup = renderToStaticMarkup(<ProblemProof />);

  it("walks from saves to a plan in three steps", () => {
    expect(markup).toMatch(
      /<h2[^>]*>from the saved tab to friday night\.<\/h2>/,
    );
    expectInOrder(markup, [
      "from the saved tab to friday night.",
      "<h3>Saves you never open</h3>",
      "<h3>Places on a map</h3>",
      "<h3>A plan for Friday</h3>",
    ]);
  });

  it("shows the two-stop evening Plan a date builds", () => {
    expectInOrder(markup, [
      "Your evening in Lisbon",
      "Dinner",
      "Prado",
      "About 13 min on foot",
      "Drinks or dessert",
      "Manteigaria",
    ]);
    expect(markup.match(/>Yours</g)).toHaveLength(2);
    expect(markup).not.toContain("Miradouro");
    for (const pattern of UNSHIPPED_VISITS) {
      expect(markup).not.toMatch(pattern);
    }
  });
});

describe("closing panel", () => {
  it("asks to map the saves, on the App Store", () => {
    const markup = renderToStaticMarkup(<ClosingPanel />);
    expect(markup).toContain("Map my saves");
    expect(markup).toContain("On the App Store, for iPhone.");
  });
});

describe("plans", () => {
  it("describes the plans the app makes today", () => {
    const markup = renderToStaticMarkup(<Plans />);
    expect(markup).toContain(
      "Open a city and Shelvr plans it around what you saved.",
    );
    expect(markup).toContain("Send it to your date.");
    expect(markup).toContain("your saves, plus suggested spots nearby");
    for (const claim of [
      "It never adds a place",
      "let them vote",
      "every stop from your saves",
    ]) {
      expect(markup).not.toContain(claim);
    }
  });
});
