import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/planShare", () => ({
  loadPlanShare: async () => ({
    outcome: "found",
    share: { places: [{ name: "Dishoom" }, { name: "Gymkhana" }] },
  }),
  planTitle: () => "Dinner this week",
}));

import { generateMetadata } from "./page";

describe("plan vote link metadata", () => {
  it("points its canonical and og:url at the vote link, not the homepage", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "tok123" }),
    });
    expect(metadata.alternates?.canonical).toBe("/p/tok123");
    expect(metadata.openGraph?.url).toBe("/p/tok123");
  });
});
