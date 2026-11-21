const RSA_ALGORITHM_IDENTIFIER = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
];

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function derNode(tag: number, content: number[]): number[] {
  return [tag, ...derLength(content.length), ...content];
}

export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const key = derNode(0x04, Array.from(pkcs1));
  return Uint8Array.from(
    derNode(0x30, [...version, ...RSA_ALGORITHM_IDENTIFIER, ...key]),
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pemBody(pem: string, label: string): string | null {
  const match = pem.match(
    new RegExp(`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`),
  );
  return match ? match[1].replace(/\s+/g, "") : null;
}

export function muxKeyToPkcs8Pem(secret: string): string {
  const pem = secret.includes("-----BEGIN")
    ? secret
    : new TextDecoder().decode(base64ToBytes(secret));
  const pkcs8 = pemBody(pem, "PRIVATE KEY");
  if (pkcs8)
    return `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----`;
  const pkcs1 = pemBody(pem, "RSA PRIVATE KEY");
  if (!pkcs1) throw new Error("MUX_SIGNING_PRIVATE_KEY is not a PEM key");
  const wrapped = bytesToBase64(pkcs1ToPkcs8(base64ToBytes(pkcs1)));
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}
