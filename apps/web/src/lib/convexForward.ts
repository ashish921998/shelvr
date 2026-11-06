export const WAITLIST_SECRET_HEADER = "x-waitlist-secret";
export const WAITLIST_CLIENT_IP_HEADER = "x-shelvr-client-ip";

export function clientIpFromHeaders(
  headers: Pick<Headers, "get">,
): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  const ip = fromForwarded || headers.get("x-real-ip")?.trim() || "";
  return ip.length > 0 && ip.length <= 64 ? ip : undefined;
}

export function clientIp(request: Request): string | undefined {
  return clientIpFromHeaders(request.headers);
}

export function forwardErrorCategory(error: unknown): string {
  const statusMatch =
    error instanceof Error
      ? error.message.match(/returned (\d{3})/)
      : undefined;
  if (statusMatch) return `convex_status_${statusMatch[1]}`;
  return error instanceof Error ? error.name : typeof error;
}
