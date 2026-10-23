import { t } from "@/lib/i18n";
import { displayHost } from "@/lib/url";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_URL_LENGTH } from "@convex/model/externalUrl";
import type { FunctionReturnType } from "convex/server";
import type { AppIntentEntity, AppIntentInvocation } from "expo-app-intents";

// The pure half of the App Intents bridge (`app-intents.tsx`): what Shelvr
// publishes to the Swift catalogs and how it reads an invocation's params.
// Keep the metadata keys in sync with `app-intents/Support/ShelvrCatalog.swift`.

const NOTE_TEXT_LIMIT = 600;
const NOTE_TITLE_LIMIT = 80;
const SYNONYM_LIMIT = 12;

export type CatalogItem = Pick<
  FunctionReturnType<typeof api.items.listItemsPage>["page"][number],
  | "_id"
  | "_creationTime"
  | "type"
  | "title"
  | "description"
  | "note"
  | "url"
  | "siteName"
  | "imageUrl"
  | "heroImageUrl"
  | "tags"
>;

type CatalogSpace = Pick<
  FunctionReturnType<typeof api.spaces.listSpaces>[number],
  "_id" | "name" | "description"
>;

export function itemTitle(item: CatalogItem): string {
  const title = item.title?.trim();
  if (title) return title;
  if (item.type === "note" && item.note)
    return (
      (item.note.trim().split("\n", 1)[0] ?? "").slice(0, NOTE_TITLE_LIMIT) ||
      t("item.note")
    );
  if (item.type === "link") return displayHost(item.url) || t("item.link");
  return t("item.savedItem");
}

export function itemRecord(item: CatalogItem): AppIntentEntity {
  const metadata: Record<string, string> = {
    kind: item.type,
    savedAt: String(Math.round(item._creationTime)),
  };
  if (item.url) metadata.url = item.url;
  if (item.siteName) metadata.site = item.siteName;
  if (item.note) metadata.text = item.note.slice(0, NOTE_TEXT_LIMIT);
  const imageUrl = item.imageUrl ?? item.heroImageUrl;
  if (imageUrl) metadata.imageUrl = imageUrl;
  return {
    id: item._id,
    title: itemTitle(item),
    subtitle: item.description?.trim() || item.siteName || undefined,
    synonyms: [
      ...new Set(item.tags.map((tag) => tag.trim()).filter(Boolean)),
    ].slice(0, SYNONYM_LIMIT),
    metadata,
  };
}

export function spaceRecord(space: CatalogSpace): AppIntentEntity {
  return {
    id: space._id,
    title: space.name.trim() || t("item.savedItem"),
    subtitle: space.description?.trim() || undefined,
  };
}

/** The image each catalog thumbnail is made from, keyed by its file name,
 * for at most `limit` items in feed order. */
export function wantedThumbnails(
  items: CatalogItem[],
  limit: number,
): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const item of items) {
    const url = item.imageUrl ?? item.heroImageUrl;
    if (url && wanted.size < limit) wanted.set(`${item._id}.jpg`, url);
  }
  return wanted;
}

export function param(
  invocation: AppIntentInvocation,
  name: string,
): string | undefined {
  const value = invocation.params[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function spaceParam(
  invocation: AppIntentInvocation,
): Id<"spaces"> | undefined {
  return param(invocation, "spaceId") as Id<"spaces"> | undefined;
}

/** The invocation's own operation id, or one derived from the invocation id
 * so a replayed invocation saves once. */
export function invocationOperationId(invocation: AppIntentInvocation): string {
  return param(invocation, "operationId") ?? `siri:${invocation.id}`;
}

/** A cheap stand-in for the server's URL policy (React Native's URL is too
 * partial to run it here): an oversized or non-web link would be refused on
 * every launch, so it is dropped instead of queued forever. */
export function isSavableUrl(url: string): boolean {
  return url.length <= MAX_URL_LENGTH && /^https?:\/\//i.test(url.trim());
}

type StagedImagePath = { path: string; operationId: string };

/** The image paths a `saveImages` invocation carries, each with the operation
 * id the Swift side sent for it, or one derived from the invocation's. Paths
 * that are not strings are skipped; an absent or malformed `paths` is none. */
export function stagedImagePaths(
  invocation: AppIntentInvocation,
  operationId: string,
): StagedImagePath[] {
  const paths = invocation.params.paths;
  if (!Array.isArray(paths)) return [];
  const operationIds = invocation.params.operationIds;
  return paths.flatMap((path, index) => {
    if (typeof path !== "string") return [];
    const sent = Array.isArray(operationIds) ? operationIds[index] : undefined;
    return [
      {
        path,
        operationId:
          typeof sent === "string" && sent.length > 0
            ? sent
            : `${operationId}:${index}`,
      },
    ];
  });
}
