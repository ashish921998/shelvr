/**
 * Verifies a JWS the App Store signed and returns its payload.
 *
 * Apple puts a three-certificate chain in the `x5c` header: a leaf that signed
 * the JWS, an intermediate, and Apple Root CA - G3. A payload is trusted only
 * when the chain ends in the pinned root, each certificate is signed by the
 * next and is inside its validity window, and the leaf and intermediate carry
 * Apple's marker extensions. Anyone can mint a self-consistent chain, so the
 * root comparison is what makes the payload Apple's.
 *
 * This runs in the default Convex V8 runtime, which has Web Crypto but no
 * X.509 parser, so the few DER fields the checks need are read by hand.
 * ponytail: no OCSP revocation check; add one if Apple ever revokes a signing
 * certificate.
 */

/** Apple Root CA - G3, SHA-256 63343abf…653e9179, valid until 2039-04-30. */
export const APPLE_ROOT_CA_G3 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

// DER-encoded OIDs, tag and length included.
const OID_P256 = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const OID_P384 = [0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22];
const OID_ECDSA_SHA256 = [
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02,
];
const OID_ECDSA_SHA384 = [
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03,
];
// 1.2.840.113635.100.6.11.1: App Store receipt signing leaf.
const OID_APPLE_LEAF = [
  0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01,
];
// 1.2.840.113635.100.6.2.1: Apple Worldwide Developer Relations intermediate.
const OID_APPLE_INTERMEDIATE = [
  0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01,
];

// Web Crypto rejects views that might sit on a SharedArrayBuffer.
type Bytes = Uint8Array<ArrayBuffer>;
type Curve = "P-256" | "P-384";
type Hash = "SHA-256" | "SHA-384";
type Node = { tag: number; start: number; body: number; end: number };
type Certificate = {
  der: Bytes;
  tbs: Bytes;
  issuer: Bytes;
  subject: Bytes;
  spki: Bytes;
  curve: Curve;
  hash: Hash;
  signature: Bytes;
  notBefore: number;
  notAfter: number;
};

class AppleJwsError extends Error {
  name = "AppleJwsError";
}

function fail(reason: string): never {
  throw new AppleJwsError(reason);
}

function readNode(der: Bytes, start: number, limit: number): Node {
  if (start + 2 > limit) fail("der_truncated");
  let length = der[start + 1];
  let body = start + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 3 || body + count > limit) fail("der_length");
    length = 0;
    for (let i = 0; i < count; i++) length = (length << 8) | der[body + i];
    body += count;
  }
  if (body + length > limit) fail("der_truncated");
  return { tag: der[start], start, body, end: body + length };
}

function children(der: Bytes, parent: Node): Node[] {
  const nodes: Node[] = [];
  for (let at = parent.body; at < parent.end; ) {
    const node = readNode(der, at, parent.end);
    nodes.push(node);
    at = node.end;
  }
  return nodes;
}

function contains(haystack: Bytes, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++)
      if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function sameBytes(a: Bytes, b: Bytes): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** UTCTime (YYMMDDHHMMSSZ) or GeneralizedTime (YYYYMMDDHHMMSSZ). */
function readTime(der: Bytes, node: Node): number {
  const text = String.fromCharCode(...der.subarray(node.body, node.end));
  const match = /^(\d{2}|\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(
    text,
  );
  if (!match || (node.tag !== 0x17 && node.tag !== 0x18)) fail("der_time");
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const fullYear =
    node.tag === 0x18 ? year : year < 50 ? 2000 + year : 1900 + year;
  return Date.UTC(fullYear, month - 1, day, hour, minute, second);
}

function parseCertificate(der: Bytes): Certificate {
  const [tbs, algorithm, signature] = children(
    der,
    readNode(der, 0, der.length),
  );
  if (!tbs || !algorithm || !signature || signature.tag !== 0x03)
    fail("cert_shape");
  // version [0] is optional in X.509; every Apple certificate carries it.
  const fields = children(der, tbs);
  if (fields[0]?.tag !== 0xa0 || fields.length < 7) fail("cert_shape");
  const [, , , issuer, validity, subject, spki] = fields;
  const [notBefore, notAfter] = children(der, validity);
  if (!notBefore || !notAfter) fail("cert_shape");
  const slice = (node: Node) => der.subarray(node.start, node.end);
  const algorithmBytes = slice(algorithm);
  const spkiBytes = slice(spki);
  return {
    der,
    tbs: slice(tbs),
    issuer: slice(issuer),
    subject: slice(subject),
    spki: spkiBytes,
    curve: contains(spkiBytes, OID_P256)
      ? "P-256"
      : contains(spkiBytes, OID_P384)
        ? "P-384"
        : fail("cert_curve"),
    hash: contains(algorithmBytes, OID_ECDSA_SHA256)
      ? "SHA-256"
      : contains(algorithmBytes, OID_ECDSA_SHA384)
        ? "SHA-384"
        : fail("cert_algorithm"),
    // A BIT STRING body starts with its unused-bit count.
    signature: der.subarray(signature.body + 1, signature.end),
    notBefore: readTime(der, notBefore),
    notAfter: readTime(der, notAfter),
  };
}

/** DER `SEQUENCE { r, s }` to the fixed-width `r || s` Web Crypto verifies. */
function rawSignature(der: Bytes, curve: Curve): Bytes {
  const size = curve === "P-256" ? 32 : 48;
  const parts = children(der, readNode(der, 0, der.length));
  if (parts.length !== 2) fail("signature_shape");
  const raw = new Uint8Array(size * 2);
  parts.forEach((part, i) => {
    let value = der.subarray(part.body, part.end);
    while (value.length > size && value[0] === 0) value = value.subarray(1);
    if (part.tag !== 0x02 || value.length > size) fail("signature_shape");
    raw.set(value, size * (i + 1) - value.length);
  });
  return raw;
}

async function verify(
  signer: Certificate,
  hash: Hash,
  signature: Bytes,
  data: Bytes,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "spki",
    signer.spki,
    { name: "ECDSA", namedCurve: signer.curve },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    { name: "ECDSA", hash },
    key,
    signature,
    data,
  );
}

async function signedBy(child: Certificate, parent: Certificate) {
  return (
    sameBytes(child.issuer, parent.subject) &&
    (await verify(
      parent,
      child.hash,
      rawSignature(child.signature, parent.curve),
      child.tbs,
    ))
  );
}

function decodeBase64(value: string): Bytes {
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    fail("base64");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64(segment)));
  } catch {
    fail("json");
  }
}

/**
 * Returns the payload of `jws` once its signature and certificate chain check
 * out against `root`, and throws otherwise. `root` is a parameter so tests can
 * anchor a fixture chain; production callers pass `APPLE_ROOT_CA_G3`.
 */
export async function verifyAppleJws(
  jws: string,
  root: string,
  now: number,
): Promise<unknown> {
  const segments = jws.split(".");
  if (segments.length !== 3) fail("jws_shape");
  const header = decodeJson(segments[0]) as { alg?: unknown; x5c?: unknown };
  const x5c = header?.x5c;
  if (
    header?.alg !== "ES256" ||
    !Array.isArray(x5c) ||
    x5c.length !== 3 ||
    !x5c.every((entry) => typeof entry === "string")
  )
    fail("jws_header");

  const [leaf, intermediate, anchor] = x5c.map((entry: string) =>
    parseCertificate(decodeBase64(entry)),
  );
  if (!sameBytes(anchor.der, decodeBase64(root))) fail("chain_root");
  if (
    !contains(leaf.tbs, OID_APPLE_LEAF) ||
    !contains(intermediate.tbs, OID_APPLE_INTERMEDIATE)
  )
    fail("chain_marker");
  for (const certificate of [leaf, intermediate, anchor])
    if (now < certificate.notBefore || now > certificate.notAfter)
      fail("chain_expired");
  if (
    !(await signedBy(intermediate, anchor)) ||
    !(await signedBy(leaf, intermediate))
  )
    fail("chain_signature");

  const signed = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  if (!(await verify(leaf, "SHA-256", decodeBase64(segments[2]), signed)))
    fail("jws_signature");
  return decodeJson(segments[1]);
}
