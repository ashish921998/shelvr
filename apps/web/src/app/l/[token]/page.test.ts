import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/listInvite", () => ({
  loadListInvite: async () => ({
    outcome: "found",
    invite: { name: "Goa weekend", placeCount: 2, cities: [], placeNames: [] },
  }),
  inviteHeading: () => "Ashish wants to save places with you",
  inviteSummary: () => "2 places",
}));

import { generateMetadata } from "./page";

describe("list invite link metadata", () => {
  it("points its canonical and og:url at the invite link and stays out of search", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ token: "tok123" }),
    });
    expect(metadata.alternates?.canonical).toBe("/l/tok123");
    expect(metadata.openGraph?.url).toBe("/l/tok123");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
