import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/entitlement", () => ({ openPaywall: vi.fn() }));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: {}, Share: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));

import { compareCities, passportUrl } from "./passport-share";
import { pendingInviteOf } from "./pending-invite";

describe("passportUrl", () => {
  it("points at the web passport page", () => {
    expect(passportUrl("ab/c")).toBe(
      "https://shelvr-web.vercel.app/passport/ab%2Fc",
    );
  });
});

describe("compareCities", () => {
  it("groups places by city, ignoring case, with no-city places last", () => {
    expect(
      compareCities([
        { name: "Nowhere" },
        { name: "Tigre", city: "Lisbon" },
        { name: "Majestic", city: "Porto" },
        { name: "Bar Alto", city: "lisbon" },
      ]),
    ).toEqual([
      { city: "Lisbon", names: ["Tigre", "Bar Alto"] },
      { city: "Porto", names: ["Majestic"] },
      { city: null, names: ["Nowhere"] },
    ]);
  });
});

describe("pendingInviteOf", () => {
  it("tells a held passport link from a list invite, and reads old list tokens as lists", () => {
    expect(pendingInviteOf(null)).toBeNull();
    expect(pendingInviteOf("abc")).toEqual({ kind: "list", token: "abc" });
    expect(pendingInviteOf("passport:abc")).toEqual({
      kind: "passport",
      token: "abc",
    });
  });
});
