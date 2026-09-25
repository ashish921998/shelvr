/** The visitor's IP as the hosting proxy reports it, or undefined when absent
 * or implausibly long. */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  const ip = fromForwarded || request.headers.get("x-real-ip")?.trim() || "";
  return ip.length > 0 && ip.length <= 64 ? ip : undefined;
}
