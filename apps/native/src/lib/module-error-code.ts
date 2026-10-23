export function moduleErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^ERR_[A-Z_]{1,60}$/.test(code)
    ? code
    : undefined;
}
