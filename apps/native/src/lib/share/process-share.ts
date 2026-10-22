import { extractFirstUrl, isProbablyUrl } from "@/lib/url";
import { userSafeMessage } from "@/lib/user-safe-message";
import type { Id } from "@convex/_generated/dataModel";
import type { ImageSaveResult, LocalImage } from "@/lib/use-save-image";
import { MAX_SHARE_ENTRIES } from "./storage";
import type {
  RawSharePayload,
  ShareEntry,
  ShareEntryKind,
  ShareSession,
} from "./storage";

export type ResolvedPayload = {
  contentType: "text" | "audio" | "image" | "video" | "file" | "website" | null;
  value: string;
  contentUri: string | null;
  contentMimeType: string | null;
};

export interface ShareSaveDeps {
  saveLink: (args: {
    url: string;
    operationId: string;
  }) => Promise<Id<"items">>;
  saveNote: (args: {
    text: string;
    operationId: string;
  }) => Promise<Id<"items">>;
  saveImage: (request: {
    image: LocalImage;
    operationId: string;
  }) => Promise<ImageSaveResult>;
}

const UNSUPPORTED_CONTENT_TYPES = new Set<
  NonNullable<ResolvedPayload["contentType"]>
>(["audio", "video", "file"]);

export function classifyPayload(payload: ResolvedPayload): {
  kind: ShareEntryKind;
  url?: string;
  reason?: string;
} {
  if (payload.contentType === "image") {
    if (!payload.contentUri) {
      return { kind: "image", reason: "Image could not be resolved" };
    }
    return { kind: "image" };
  }
  if (payload.contentType === "website") {
    const url = payload.value.trim();
    if (!url || !isProbablyUrl(url)) {
      return { kind: "link", reason: "Shared link was not a valid URL" };
    }
    return { kind: "link" };
  }
  if (
    payload.contentType &&
    UNSUPPORTED_CONTENT_TYPES.has(payload.contentType)
  ) {
    return {
      kind: "unsupported",
      reason: `Unsupported content type: ${payload.contentType}`,
    };
  }
  const value = payload.value.trim();
  if (!value) {
    return { kind: "note", reason: "Shared text was empty" };
  }
  const url = isProbablyUrl(value) ? value : extractFirstUrl(value);
  if (url) {
    return { kind: "link", url };
  }
  return { kind: "note" };
}

function firstLink(resolved: ResolvedPayload[]): string | null {
  for (const payload of resolved) {
    const result = classifyPayload(payload);
    if (result.kind === "link" && result.reason === undefined) {
      return result.url ?? payload.value.trim();
    }
  }
  return null;
}

function classifyInShare(
  resolved: ResolvedPayload[],
  index: number,
): ReturnType<typeof classifyPayload> {
  const result = classifyPayload(resolved[index]);
  if (result.kind !== "note" || result.reason !== undefined) return result;
  const url = firstLink(resolved);
  return url === null ? result : { kind: "link", url };
}

function shareLinkUrl(
  entry: ShareEntry,
  resolved: ResolvedPayload[],
): string | null {
  if (entry.status === "saved" && entry.kind !== "link") return null;
  const payload = resolved[entry.index];
  if (payload === undefined) return null;
  const { kind, reason, url } = classifyInShare(resolved, entry.index);
  if (kind !== "link" || reason !== undefined) return null;
  return url ?? payload.value.trim();
}

export function shareGroups(
  entries: readonly ShareEntry[],
  resolved: ResolvedPayload[],
): ShareEntry[][] {
  const groups = new Map<string, ShareEntry[]>();
  for (const entry of entries) {
    const url = shareLinkUrl(entry, resolved);
    const key = url === null ? `entry:${entry.operationId}` : `link:${url}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.values()];
}

export function resolvedFromRawPayloads(
  raw: RawSharePayload[],
): ResolvedPayload[] {
  return raw.map((payload) => {
    const contentMimeType = payload.mimeType ?? null;
    switch (payload.shareType) {
      case "url":
        return {
          contentType: "website" as const,
          value: payload.value,
          contentUri: null,
          contentMimeType,
        };
      case "image":
        return {
          contentType: "image" as const,
          value: payload.value,
          contentUri: null,
          contentMimeType,
        };
      case "audio":
      case "video":
      case "file":
        return {
          contentType: payload.shareType,
          value: payload.value,
          contentUri: null,
          contentMimeType,
        };
      case "text":
      default:
        return {
          contentType: "text" as const,
          value: payload.value,
          contentUri: null,
          contentMimeType,
        };
    }
  });
}

export function classifyEntries(
  session: ShareSession,
  resolved: ResolvedPayload[],
): ShareEntry[] {
  return session.entries.map((entry) => {
    const payload = resolved[entry.index];
    if (payload === undefined) {
      return {
        ...entry,
        status: "failed" as const,
        message: "No resolved payload for this entry",
      };
    }
    const { kind, reason } = classifyInShare(resolved, entry.index);
    if (reason !== undefined) {
      const status: ShareEntry["status"] =
        kind === "unsupported" ? "unsupported" : "failed";
      return { ...entry, kind, status, message: reason };
    }
    return { ...entry, kind };
  });
}

export async function processSession(
  session: ShareSession,
  resolved: ResolvedPayload[],
  deps: ShareSaveDeps,
  onEntrySettled?: (entry: ShareEntry) => void,
): Promise<ShareSession> {
  if (
    session.entries.length > MAX_SHARE_ENTRIES ||
    resolved.length > MAX_SHARE_ENTRIES
  )
    throw new Error("Share batch is too large");
  const entries = session.entries.map((e) => ({ ...e }));
  const linkDeps = sharedLinkSaves(entries, resolved, deps);

  for (const entry of entries) {
    if (entry.status === "saved" || entry.status === "unsupported") continue;

    const settled = await processOne(entry, resolved, linkDeps);
    entry.kind = settled.kind;
    entry.status = settled.status;
    entry.itemId = settled.itemId;
    entry.message = settled.message;
    onEntrySettled?.(entry);
  }

  return { ...session, entries };
}

function sharedLinkSaves(
  entries: ShareEntry[],
  resolved: ResolvedPayload[],
  deps: ShareSaveDeps,
): ShareSaveDeps {
  const saves = new Map<string, Promise<Id<"items">>>();
  for (const entry of entries) {
    if (entry.status !== "saved" || !entry.itemId) continue;
    const url = shareLinkUrl(entry, resolved);
    if (url !== null) {
      saves.set(url, Promise.resolve(entry.itemId as Id<"items">));
    }
  }
  return {
    ...deps,
    saveLink: (args) => {
      const existing = saves.get(args.url);
      if (existing) return existing;
      const save = deps.saveLink(args);
      saves.set(args.url, save);
      return save;
    },
  };
}

async function processOne(
  entry: ShareEntry,
  resolved: ResolvedPayload[],
  deps: ShareSaveDeps,
): Promise<
  Partial<ShareEntry> & { kind: ShareEntryKind; status: ShareEntry["status"] }
> {
  const payload = resolved[entry.index];
  const operationId = entry.operationId;

  if (payload === undefined) {
    return {
      kind: entry.kind,
      status: "failed",
      message: "No resolved payload for this entry",
    };
  }
  const { kind, reason, url } = classifyInShare(resolved, entry.index);
  if (reason !== undefined) {
    const status: ShareEntry["status"] =
      kind === "unsupported" ? "unsupported" : "failed";
    return { kind, status, message: reason };
  }

  try {
    if (kind === "link") {
      const itemId = await deps.saveLink({
        url: url ?? payload.value.trim(),
        operationId,
      });
      return {
        kind,
        status: "saved",
        itemId: String(itemId),
        message: undefined,
      };
    }
    if (kind === "note") {
      const itemId = await deps.saveNote({
        text: payload.value.trim(),
        operationId,
      });
      return {
        kind,
        status: "saved",
        itemId: String(itemId),
        message: undefined,
      };
    }
    const image: LocalImage = {
      uri: payload.contentUri!,
      mimeType: payload.contentMimeType ?? undefined,
    };
    const result = await deps.saveImage({ image, operationId });
    if (result.status === "saved") {
      return {
        kind,
        status: "saved",
        itemId: String(result.itemId),
        message: undefined,
      };
    }
    return { kind, status: "failed", message: result.message };
  } catch (error) {
    return {
      kind,
      status: "failed",
      message: userSafeMessage(error, "Could not save this item"),
    };
  }
}

export function firstSharedUrl(raw: RawSharePayload[]): string | null {
  return firstLink(resolvedFromRawPayloads(raw));
}
