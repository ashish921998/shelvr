import ipaddr from "ipaddr.js";

const MAX_IP_LENGTH = 64;

/**
 * Limiter key for a request without a usable client IP. Every such request
 * shares one bucket, so a caller cannot escape the per-IP limiter by leaving
 * the header off or filling it with garbage.
 */
export const UNKNOWN_IP_LIMITER_KEY = "unknown";

/**
 * The canonical form of a visitor IP, or undefined when it is not one. The
 * web routes derive the IP from proxy headers they do not fully control, so
 * anything that does not parse as an IP address is treated as absent rather
 * than persisted as an attacker-chosen limiter key. `2001:db8::1` and
 * `2001:0db8:0000::0001` share one bucket, and an IPv4-mapped IPv6 address
 * counts against the plain IPv4 key.
 */
export function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ip = value.trim().slice(0, MAX_IP_LENGTH);
  // A zone id (`fe80::1%eth0`) is link-local scope and can never describe a
  // client of a public server. ipaddr.js keeps it in the normalized form, so
  // without this check each zone spelling would mint a fresh limiter bucket.
  if (ip.includes("%")) return undefined;
  if (!ipaddr.isValid(ip)) return undefined;
  const parsed = ipaddr.parse(ip);
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return v6.toIPv4Address().toNormalizedString();
    }
  }
  return parsed.toNormalizedString();
}

/** The per-address limiter key: the IP, or the shared unknown bucket. */
export function ipKey(value: string | undefined): string {
  return normalizeIp(value) ?? UNKNOWN_IP_LIMITER_KEY;
}

/**
 * The network a visitor is counted against where one person should not get
 * a fresh allowance per address. One IPv6 device holds a whole /64 and can
 * rotate through it, so IPv6 is keyed by its /64 prefix; IPv4 keeps the full
 * address.
 */
export function ipNetwork(value: string | undefined): string {
  const address = normalizeIp(value);
  if (address === undefined) return UNKNOWN_IP_LIMITER_KEY;
  if (!address.includes(":")) return address;
  return `${address.split(":").slice(0, 4).join(":")}::/64`;
}
