/**
 * Apple's Retention Messaging API: the App Store posts here while a subscriber
 * looks at the page where they can cancel, and the reply names which
 * pre-uploaded, Apple-approved message to show them.
 *
 * https://developer.apple.com/documentation/retentionmessaging
 */
import { verifyAppleJws } from "./appleJws";

/** Shelvr's App Store id, `ascAppId` in eas.json. */
const SHELVR_APP_APPLE_ID = 6798143550;

// Apple's body is three certificates and a short payload, about 5 KB.
const MAX_BODY_BYTES = 32 * 1024;

export type RetentionReply = {
  status: 200 | 400;
  body: object;
  reason?: string;
};

/**
 * Answers one Get Retention Message request. A reply with no `message` leaves
 * Apple on the default message configured for the product and locale, so an
 * unset `messageId` is a working state, not an error.
 *
 * ponytail: one message for every subscriber. Choosing by save count needs
 * message ids, which exist only once Apple grants access and approves uploads.
 */
export async function answerRetentionRequest(
  body: string,
  options: { root: string; now: number; messageId?: string },
): Promise<RetentionReply> {
  const reject = (reason: string): RetentionReply => ({
    status: 400,
    body: { error: "bad_request" },
    reason,
  });
  if (body.length > MAX_BODY_BYTES) return reject("body_too_large");
  let signedPayload: unknown;
  try {
    signedPayload = JSON.parse(body)?.signedPayload;
  } catch {
    return reject("body_json");
  }
  if (typeof signedPayload !== "string") return reject("body_shape");
  let payload: { appAppleId?: unknown };
  try {
    payload = (await verifyAppleJws(
      signedPayload,
      options.root,
      options.now,
    )) as typeof payload;
  } catch (error) {
    // AppleJwsError messages are fixed codes. Anything else is the runtime
    // refusing a crypto call, which must not hide behind a parsing code.
    return reject(
      error instanceof Error && error.name === "AppleJwsError"
        ? error.message
        : "verify_unavailable",
    );
  }
  if (payload?.appAppleId !== SHELVR_APP_APPLE_ID) return reject("wrong_app");
  return {
    status: 200,
    body: options.messageId
      ? { message: { messageIdentifier: options.messageId } }
      : {},
  };
}
