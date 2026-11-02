const MAX_SENDER_NAME_CHARS = 40;

export function firstNameOf(name: string | undefined): string | undefined {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.length > MAX_SENDER_NAME_CHARS || first.includes("@")) {
    return undefined;
  }
  return first;
}
