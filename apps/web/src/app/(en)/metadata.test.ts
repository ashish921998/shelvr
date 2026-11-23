import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { metadata as dateNightPlanner } from "./date-night-planner/page";
import { metadata as layout } from "./layout";
import Home, { metadata as home } from "./page";
import { metadata as privacy } from "./privacy/page";
import { metadata as support } from "./support/page";
import { metadata as terms } from "./terms/page";

describe("site metadata", () => {
  // A page without its own alternates or openGraph inherits the layout's whole object.
  it("leaves the canonical and og:url out of the root layout", () => {
    expect(layout.alternates).toBeUndefined();
    expect(layout.openGraph).not.toHaveProperty("url");
  });

  it("describes saving places in the homepage search and social title", () => {
    const title = "Save Places from Reels and TikTok | Shelvr";

    expect(home.title).toBe(title);
    expect(home.openGraph?.title).toBe(title);
    expect(home.twitter?.title).toBe(title);
    expect(layout.title).toBe("Shelvr — saved it, now go there");
  });

  it("publishes the site's preferred name and brand in homepage structured data", () => {
    const html = renderToStaticMarkup(createElement(Home));
    const scripts = [
      ...html.matchAll(
        /<script type="application\/ld\+json">(.*?)<\/script>/gs,
      ),
    ];

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0]?.[1] ?? "null")).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "https://tryshelvr.app/#website",
          name: "Shelvr",
          url: "https://tryshelvr.app/",
          publisher: { "@id": "https://tryshelvr.app/#organization" },
        },
        {
          "@type": "Organization",
          "@id": "https://tryshelvr.app/#organization",
          name: "Shelvr",
          url: "https://tryshelvr.app/",
          logo: "https://tryshelvr.app/shelvr-mark.svg",
        },
      ],
    });
  });

  it.each([
    ["/", home],
    ["/date-night-planner", dateNightPlanner],
    ["/terms", terms],
    ["/privacy", privacy],
    ["/support", support],
  ])("gives %s its own canonical and og:url", (path, metadata) => {
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.openGraph).toMatchObject({
      url: path,
      title: metadata.title,
      description: metadata.description,
    });
  });

  it("gives the date night planner its own social preview copy", () => {
    expect(dateNightPlanner.twitter).toMatchObject({
      title: dateNightPlanner.title,
      description: dateNightPlanner.description,
    });
  });
});
