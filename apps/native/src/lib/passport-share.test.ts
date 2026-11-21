import { describe, expect, it, vi } from "vitest";
import { passportUrl } from "./passport-share";
import { pendingInviteOf } from "./pending-invite";

vi.mock("@/lib/pro-gate", () => ({
  useProGate: () => ({
    admit: async () => "go",
    denied: async () => true,
    blocked: async () => {},
    passed: () => {},
    loading: false,
  }),
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: {} }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: {}, Share: {} }));
vi.mock("expo-router", () => ({ useRouter: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));

describe("passportUrl", () => {
  it("points at the web passport page", () => {
    expect(passportUrl("ab/c")).toBe("https://tryshelvr.app/passport/ab%2Fc");
  });
});

describe("pendingInviteOf", () => {
  it("tells a held passport link from a list invite, and reads old list tokens as lists", () => {
    expect(pendingInviteOf("abc")).toEqual({ kind: "list", token: "abc" });
    expect(pendingInviteOf("passport:abc")).toEqual({
      kind: "passport",
      token: "abc",
    });
  });
});
