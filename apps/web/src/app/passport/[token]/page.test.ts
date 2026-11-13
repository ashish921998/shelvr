import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/passportShare", () => ({
  loadPassport: async () => ({
    outcome: "found",
    passport: { places: 2, cities: 1, countries: null, stamps: [] },
  }),
  passportTitle: () => "Maya’s passport",
  passportSummary: () => "2 places · 1 city",
}));

import { generateMetadata } from "./page";

describe("passport link metadata", () => {
  it("points its canonical and og:url at the passport link and stays out of search", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "tok123" }),
    });
    expect(metadata.title).toBe("Maya’s passport — Shelvr");
    expect(metadata.alternates?.canonical).toBe("/passport/tok123");
    expect(metadata.openGraph?.url).toBe("/passport/tok123");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
