import { describe, expect, it } from "vitest";

import { clientIp, clientIpFromHeaders } from "./convexForward";

describe("clientIpFromHeaders", () => {
  it("takes the first x-forwarded-for hop", () => {
    expect(
      clientIpFromHeaders(
        new Headers({
          "x-forwarded-for": " 2001:db8:1::1 , 10.0.0.1, 10.0.0.2",
          "x-real-ip": "198.51.100.7",
        }),
      ),
    ).toBe("2001:db8:1::1");
  });

  it("falls back to x-real-ip", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-real-ip": " 198.51.100.7 " })),
    ).toBe("198.51.100.7");
    expect(
      clientIpFromHeaders(
        new Headers({ "x-forwarded-for": " ", "x-real-ip": "198.51.100.7" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("rejects an address over 64 characters, and no address at all", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": "1".repeat(65) })),
    ).toBeUndefined();
    expect(
      clientIpFromHeaders(new Headers({ "x-real-ip": "2".repeat(64) })),
    ).toBe("2".repeat(64));
    expect(clientIpFromHeaders(new Headers())).toBeUndefined();
  });

  it("reads a request the same way", () => {
    expect(
      clientIp(
        new Request("https://shelvr.test/api", {
          headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
        }),
      ),
    ).toBe("203.0.113.9");
  });
});
