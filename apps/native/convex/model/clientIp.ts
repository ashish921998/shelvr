import ipaddr from "ipaddr.js";

const MAX_IP_LENGTH = 64;

export const UNKNOWN_IP_LIMITER_KEY = "unknown";

export function normalizeIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ip = value.trim().slice(0, MAX_IP_LENGTH);
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

export function ipKey(value: string | undefined): string {
  return normalizeIp(value) ?? UNKNOWN_IP_LIMITER_KEY;
}

export function ipNetwork(value: string | undefined): string {
  const address = normalizeIp(value);
  if (address === undefined) return UNKNOWN_IP_LIMITER_KEY;
  if (!address.includes(":")) return address;
  return `${address.split(":").slice(0, 4).join(":")}::/64`;
}
