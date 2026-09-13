import { ConvexError } from "convex/values";

// The one rule for a user-typed space name, shared by createSpace,
// updateSpace, and the onboarding demo's destination pick. The client reads
// the constant for its input's maxLength; this is the server-side backstop.
// No server-runtime imports, so the app can load it as `@convex/model/spaceName`.

/** Long enough for "Apartment shopping list", short enough for a card title. */
export const MAX_SPACE_NAME_LENGTH = 60;

export const SPACE_NAME_EMPTY_MESSAGE = "Give the space a name.";
export const SPACE_NAME_TOO_LONG_MESSAGE = `Space names can be up to ${MAX_SPACE_NAME_LENGTH} characters.`;

/** Trims a space name and rejects an empty or over-long one. ConvexError, not
 * Error: production redacts a plain Error's message to "Server Error", and
 * these sentences are meant for the user. */
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
