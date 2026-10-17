/**
 * Apple's Retention Messaging API: the App Store posts here while a subscriber
 * looks at the page where they can cancel, and the reply names which
 * pre-uploaded, Apple-approved message to show them.
 *
 * https://developer.apple.com/documentation/retentionmessaging
 */
import { verifyAppleJws } from "./appleJws";
import { signEs256Jwt } from "./appleSigning";

/** Shelvr's App Store id, `ascAppId` in eas.json. */
const SHELVR_APP_APPLE_ID = 6798143550;
/** The production bundle id; dev and preview builds never reach this sheet. */
const SHELVR_BUNDLE_ID = "app.shelvr.save";

// Apple's body is three certificates and a short payload, about 5 KB.
export const RETENTION_MAX_BODY_BYTES = 32 * 1024;

export type RetentionReply = {
  status: 200 | 400;
  body: object;
  /** Why the request was refused (400), or why a 200 carries no offer. */
  reason?: string;
};

/** A promotional offer to attach on the cancel sheet for one product. */
type RetentionOffer = { offerIdentifier: string; messageIdentifier: string };

/** The Apple In-App Purchase key that signs promotional offers. */
export type OfferSigningKey = {
  keyId: string;
  issuerId: string;
  privateKey: string;
};

/**
 * Reads `APPLE_RETENTION_OFFERS`: a JSON object from product id to the
 * App Store Connect offer id and the approved, image-free message id shown
 * with it. A product left out gets the plain message. Anything malformed is
 * dropped, so a bad paste falls back to the message instead of failing.
 */
export function parseRetentionOffers(
  raw: string | undefined,
): Record<string, RetentionOffer> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const offers: Record<string, RetentionOffer> = {};
  for (const [productId, value] of Object.entries(parsed)) {
    const { offerIdentifier, messageIdentifier } = (value ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof offerIdentifier === "string" &&
      offerIdentifier &&
      typeof messageIdentifier === "string" &&
      messageIdentifier
    )
      offers[productId] = { offerIdentifier, messageIdentifier };
  }
  return offers;
}

/** Apple's promotional offer signature, V2: an ES256 JWS over the offer. */
export async function signPromotionalOffer(
  key: OfferSigningKey,
  offer: { productId: string; offerIdentifier: string; transactionId: string },
  now: number,
): Promise<string> {
  return await signEs256Jwt(
    key.privateKey,
    { kid: key.keyId, typ: "JWT" },
    {
      iss: key.issuerId,
      iat: Math.floor(now / 1000),
      aud: "promotional-offer",
      bid: SHELVR_BUNDLE_ID,
      nonce: crypto.randomUUID(),
      ...offer,
    },
  );
}

/**
 * Answers one Get Retention Message request. A reply with no `message` leaves
 * Apple on the default message configured for the product and locale, so an
 * unset `messageId` is a working state, not an error.
 *
 * A product with a configured offer gets that offer, signed for the
 * subscriber's original transaction, when the signing key is set. Signing
 * failures fall back to the plain message, never to an error.
 */
export async function answerRetentionRequest(
  body: string,
  options: {
    root: string;
    now: number;
    messageId?: string;
    offers?: Record<string, RetentionOffer>;
    signingKey?: OfferSigningKey;
  },
): Promise<RetentionReply> {
  const reject = (reason: string): RetentionReply => ({
    status: 400,
    body: { error: "bad_request" },
    reason,
  });
  let signedPayload: unknown;
  try {
    signedPayload = JSON.parse(body)?.signedPayload;
  } catch {
    return reject("body_json");
  }
  if (typeof signedPayload !== "string") return reject("body_shape");
  let payload: {
    appAppleId?: unknown;
    productId?: unknown;
    originalTransactionId?: unknown;
  };
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
  const plain: RetentionReply = {
    status: 200,
    body: options.messageId
      ? { message: { messageIdentifier: options.messageId } }
      : {},
  };
  const { productId, originalTransactionId } = payload;
  const offer =
    typeof productId === "string" ? options.offers?.[productId] : undefined;
  if (!offer) return plain;
  if (!options.signingKey) return { ...plain, reason: "offer_key_unset" };
  if (typeof originalTransactionId !== "string" || !originalTransactionId)
    return { ...plain, reason: "offer_no_transaction" };
  let signature: string;
  try {
    signature = await signPromotionalOffer(
      options.signingKey,
      {
        productId: productId as string,
        offerIdentifier: offer.offerIdentifier,
        transactionId: originalTransactionId,
      },
      options.now,
    );
  } catch {
    return { ...plain, reason: "offer_sign_failed" };
  }
  return {
    status: 200,
    body: {
      promotionalOffer: {
        messageIdentifier: offer.messageIdentifier,
        promotionalOfferSignatureV2: signature,
      },
    },
  };
}
