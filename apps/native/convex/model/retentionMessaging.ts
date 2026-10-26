import { verifyAppleJws } from "./appleJws";
import { signEs256Jwt } from "./appleSigning";

const SHELVR_APP_APPLE_ID = 6798143550;
const SHELVR_BUNDLE_ID = "app.shelvr.save";

export const RETENTION_MAX_BODY_BYTES = 32 * 1024;

export type RetentionReply = {
  status: 200 | 400;
  body: object;
  reason?: string;
};

type RetentionOffer = { offerIdentifier: string; messageIdentifier: string };

export type OfferSigningKey = {
  keyId: string;
  issuerId: string;
  privateKey: string;
};

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
    typeof productId === "string" &&
    options.offers &&
    Object.hasOwn(options.offers, productId)
      ? options.offers[productId]
      : undefined;
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
