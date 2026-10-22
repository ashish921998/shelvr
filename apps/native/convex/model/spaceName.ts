import { ConvexError } from "convex/values";

export const MAX_SPACE_NAME_LENGTH = 60;

export const SPACE_NAME_EMPTY_MESSAGE = "Give the space a name.";
export const SPACE_NAME_TOO_LONG_MESSAGE = `Space names can be up to ${MAX_SPACE_NAME_LENGTH} characters.`;

export function validateSpaceName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw new ConvexError(SPACE_NAME_EMPTY_MESSAGE);
  }
  if (name.length > MAX_SPACE_NAME_LENGTH) {
    throw new ConvexError(SPACE_NAME_TOO_LONG_MESSAGE);
  }
  return name;
}

export const MAX_SPACE_DESCRIPTION_LENGTH = 500;

export const SPACE_DESCRIPTION_TOO_LONG_MESSAGE = `Space descriptions can be up to ${MAX_SPACE_DESCRIPTION_LENGTH} characters.`;

export function validateSpaceDescription(
  raw: string | undefined,
): string | undefined {
  if (raw !== undefined && raw.length > MAX_SPACE_DESCRIPTION_LENGTH) {
    throw new ConvexError(SPACE_DESCRIPTION_TOO_LONG_MESSAGE);
  }
  return raw;
}
