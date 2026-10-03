// Narrowing for the untrusted JSON bodies the iOS App Intents post to the
// `/app-intents/*` routes (http.ts). Pure, so it is unit tested directly.

export class BodyTooLargeError extends Error {}

/** Bound bytes as they arrive, including requests with a missing or false
 * Content-Length. Cancel rather than buffering the remainder. */
export async function readBoundedText(
  req: Request,
  maxBytes: number,
): Promise<string> {
  const body = await readBoundedBlob(req, maxBytes);
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await body.arrayBuffer(),
  );
}

export async function readBoundedBlob(
  req: Request,
  maxBytes: number,
): Promise<Blob> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await req.body?.cancel();
    throw new BodyTooLargeError();
  }
  if (
    req.headers.get("content-encoding") &&
    req.headers.get("content-encoding") !== "identity"
  ) {
    await req.body?.cancel();
    throw new BodyTooLargeError();
  }
  if (!req.body) return new Blob([]);
  const reader = req.body.getReader();
  let bytes = 0;
  const parts: BlobPart[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new BodyTooLargeError();
      parts.push(new Uint8Array(chunk.value));
    }
    return new Blob(parts, {
      type: req.headers.get("content-type") ?? "application/octet-stream",
    });
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** Upper bound on a captured note, in characters. */
export const MAX_CAPTURE_NOTE_LENGTH = 20_000;
/** Upper bound on a captured URL before normalization. */
export const MAX_CAPTURE_URL_LENGTH = 8192;
/** Upper bound on the advisory context sent with an image. Cut, not refused. */
export const MAX_CAPTURE_CONTEXT_INPUT = 8000;
/** Convex ids and client operation ids are far shorter than this. */
const MAX_ID_LENGTH = 200;

export type ImageBeginRequest = { operationId: string };

export type ImageFinishRequest = {
  operationId: string;
  storageId: string;
  aspectRatio?: number;
  isSticker?: boolean;
  spaceId?: string;
  context?: string;
};

export type LinkOrNoteRequest =
  | { operationId: string; kind: "link"; url: string; spaceId?: string }
  | { operationId: string; kind: "note"; text: string; spaceId?: string };

function asObject(body: unknown): Record<string, unknown> | undefined {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH
    ? value
    : undefined;
}

/** An optional id: absent, null, or empty reads as none; anything else must
 * be a well-sized string. Returns `false` for a malformed value. */
function optionalId(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === "") return undefined;
  return id(value) ?? false;
}

export function parseImageBegin(body: unknown): ImageBeginRequest | undefined {
  const operationId = id(asObject(body)?.operationId);
  return operationId === undefined ? undefined : { operationId };
}

export function parseImageFinish(
  body: unknown,
): ImageFinishRequest | undefined {
  const fields = asObject(body);
  if (fields === undefined) return undefined;
  const operationId = id(fields.operationId);
  const storageId = id(fields.storageId);
  const spaceId = optionalId(fields.spaceId);
  const { aspectRatio, isSticker, context } = fields;
  if (operationId === undefined || storageId === undefined) return undefined;
  if (spaceId === false) return undefined;
  if (
    aspectRatio !== undefined &&
    aspectRatio !== null &&
    (typeof aspectRatio !== "number" ||
      !Number.isFinite(aspectRatio) ||
      aspectRatio <= 0)
  ) {
    return undefined;
  }
  if (
    isSticker !== undefined &&
    isSticker !== null &&
    typeof isSticker !== "boolean"
  ) {
    return undefined;
  }
  if (context !== undefined && context !== null && typeof context !== "string")
    return undefined;
  return {
    operationId,
    storageId,
    aspectRatio: typeof aspectRatio === "number" ? aspectRatio : undefined,
    isSticker: isSticker === true ? true : undefined,
    spaceId,
    context:
      typeof context === "string"
        ? context.slice(0, MAX_CAPTURE_CONTEXT_INPUT)
        : undefined,
  };
}

export function parseLinkOrNote(body: unknown): LinkOrNoteRequest | undefined {
  const fields = asObject(body);
  if (fields === undefined) return undefined;
  const operationId = id(fields.operationId);
  const spaceId = optionalId(fields.spaceId);
  if (operationId === undefined || spaceId === false) return undefined;
  const { kind, url, text } = fields;
  if (kind === "link") {
    if (
      typeof url !== "string" ||
      url.trim() === "" ||
      url.length > MAX_CAPTURE_URL_LENGTH
    ) {
      return undefined;
    }
    return { operationId, kind, url: url.trim(), spaceId };
  }
  if (kind === "note") {
    if (
      typeof text !== "string" ||
      text.trim() === "" ||
      text.length > MAX_CAPTURE_NOTE_LENGTH
    ) {
      return undefined;
    }
    return { operationId, kind, text, spaceId };
  }
  return undefined;
}
