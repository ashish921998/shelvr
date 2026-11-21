export type MuxEvent =
  | { kind: "processing"; mediaId: string; assetId: string }
  | {
      kind: "ready";
      mediaId: string;
      assetId: string;
      playbackId: string;
      duration?: number;
      aspectRatio?: string;
    }
  | { kind: "errored"; mediaId: string; assetId?: string }
  | { kind: "ignored" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstPlaybackId(data: Record<string, unknown>): string | undefined {
  const ids = data.playback_ids;
  if (!Array.isArray(ids)) return undefined;
  for (const entry of ids) {
    const id = str(asRecord(entry)?.id);
    if (id) return id;
  }
  return undefined;
}

export function parseMuxEvent(payload: unknown): MuxEvent {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const type = str(root?.type);
  if (!root || !data || !type) return { kind: "ignored" };
  const assetId = type.startsWith("video.upload.")
    ? str(data.asset_id)
    : str(data.id);
  const mediaId =
    str(data.passthrough) ??
    str(asRecord(data.new_asset_settings)?.passthrough);
  if (!mediaId) return { kind: "ignored" };
  if (type === "video.upload.asset_created" && assetId) {
    return { kind: "processing", mediaId, assetId };
  }
  if (type === "video.asset.ready" && assetId) {
    const playbackId = firstPlaybackId(data);
    if (!playbackId) return { kind: "errored", mediaId, assetId };
    return {
      kind: "ready",
      mediaId,
      assetId,
      playbackId,
      duration: typeof data.duration === "number" ? data.duration : undefined,
      aspectRatio: str(data.aspect_ratio),
    };
  }
  if (type === "video.asset.errored" || type === "video.upload.errored") {
    return { kind: "errored", mediaId, assetId };
  }
  return { kind: "ignored" };
}
