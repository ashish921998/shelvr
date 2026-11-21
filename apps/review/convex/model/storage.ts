import { AwsClient } from "aws4fetch";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const ALLOWED_TYPES = /^video\/(mp4|quicktime|webm|x-m4v|3gpp|x-matroska)$/;

export function cleanContentType(raw: string): string {
  const type = raw.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.test(type)) throw new Error("Upload a video file");
  return type;
}

export function mediaKey(mediaId: string): string {
  return `media/${mediaId}`;
}

export function objectUrl(config: R2Config, key: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
}

export async function presign(
  config: R2Config,
  {
    key,
    method,
    expiresIn,
    contentType,
  }: {
    key: string;
    method: "GET" | "PUT";
    expiresIn: number;
    contentType?: string;
  },
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = new URL(objectUrl(config, key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const headers = contentType ? { "Content-Type": contentType } : undefined;
  const signed = await client.sign(new Request(url, { method, headers }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function headObject(
  config: R2Config,
  key: string,
): Promise<{ size: number } | null> {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const response = await client.fetch(objectUrl(config, key), {
    method: "HEAD",
  });
  if (!response.ok) return null;
  return { size: Number(response.headers.get("content-length") ?? 0) };
}

export function aspectRatio(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  const w = Math.round(width);
  const h = Math.round(height);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}
