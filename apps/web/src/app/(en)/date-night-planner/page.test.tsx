import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DateNightPlannerPage from "./page";

describe("the public date night planner page", () => {
  it("explains the iPhone feature and renders a complete example as page text", () => {
    const html = renderToStaticMarkup(<DateNightPlannerPage />);

    expect(html).toContain("Plan a date from places you saved");
    expect(html).toContain("Personal date plans require Shelvr Pro.");
    expect(html).toMatch(
      /<a(?=[^>]*href="https:\/\/apps\.apple\.com\/app\/id6798143550)(?=[^>]*aria-label="Download Shelvr on the App Store")[^>]*>/,
    );
    expect(html).toMatch(
      /Example date in Lisbon.*Prado.*About 13 minutes on foot to the next stop.*Manteigaria/,
    );
  });
});
