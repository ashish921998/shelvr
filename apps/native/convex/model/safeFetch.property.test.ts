import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isPublicAddress } from "./safeFetch";

const octet = fc.integer({ min: 0, max: 255 });

/** An IPv4 address inside `base/prefix`, as four octets. */
function inRange(base: [number, number, number, number], prefix: number) {
  const start =
    ((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3]) >>> 0;
  return fc.integer({ min: 0, max: 2 ** (32 - prefix) - 1 }).map((offset) => {
    const n = (start + offset) >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  });
}

// Ranges a link save must never reach: the server's own network, the cloud
// metadata service, and everything not routable on the public internet.
const PRIVATE = fc.oneof(
  inRange([0, 0, 0, 0], 8),
  inRange([10, 0, 0, 0], 8),
  inRange([100, 64, 0, 0], 10),
  inRange([127, 0, 0, 0], 8),
  inRange([169, 254, 0, 0], 16),
  inRange([172, 16, 0, 0], 12),
  inRange([192, 168, 0, 0], 16),
  inRange([224, 0, 0, 0], 4),
  inRange([240, 0, 0, 0], 4),
);

const dotted = (o: number[]) => o.join(".");
const mappedHex = (o: number[]) =>
  `::ffff:${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;

describe("isPublicAddress", () => {
  it("never allows a private or reserved IPv4, in any spelling", () => {
    fc.assert(
      fc.property(PRIVATE, (o) => {
        expect(isPublicAddress(dotted(o))).toBe(false);
        expect(isPublicAddress(`::ffff:${dotted(o)}`)).toBe(false);
        expect(isPublicAddress(mappedHex(o))).toBe(false);
      }),
    );
  });

  it("answers the same for an IPv4 and its IPv4-mapped IPv6 forms", () => {
    fc.assert(
      fc.property(fc.tuple(octet, octet, octet, octet), (o) => {
        const plain = isPublicAddress(dotted(o));
        expect(isPublicAddress(`::ffff:${dotted(o)}`)).toBe(plain);
        expect(isPublicAddress(mappedHex(o))).toBe(plain);
      }),
    );
  });

  it("never allows a string that is not an IP address", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        fc.pre(!/^[\d.:a-fA-F]+$/.test(s));
        expect(isPublicAddress(s)).toBe(false);
      }),
    );
  });
});
