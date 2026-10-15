import { analytics } from "@/lib/analytics";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement } from "@/lib/entitlement";
import { useHomeFeed } from "@/lib/home-feed";
import { t } from "@/lib/i18n";
import { displayHost } from "@/lib/url";
import { useSaveImages } from "@/lib/use-save-image";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_URL_LENGTH } from "@convex/model/externalUrl";
import { saveErrorCode } from "@convex/model/saveErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as AppIntents from "expo-app-intents";
import { Directory, File, Paths } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useNavigationContainerRef, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { createMMKV } from "react-native-mmkv";
import { Images } from "react-native-nitro-image";

// Bridge between Shelvr and the Swift App Intents in `app-intents/` (Siri,
// Shortcuts, Spotlight, Visual Intelligence). Keep the catalog kinds, metadata
// keys, and invocation names in sync with `app-intents/Support/ShelvrCatalog.swift`
// and the intents that dispatch them.

const ITEM_KIND = "item";
const SPACE_KIND = "space";
// Catalogs live in UserDefaults, so they carry the newest saves only.
const ITEM_CATALOG_LIMIT = 300;
const THUMB_LIMIT = 60;
const THUMB_MAX_DIM = 256;
const THUMB_TIMEOUT_MS = 20_000;
const NOTE_TEXT_LIMIT = 600;

type SetupModule = {
  setCaptureCredentials(siteUrl: string, token: string): Promise<void>;
  clearCaptureCredentials(): Promise<void>;
  hasCaptureCredentials(): Promise<boolean>;
  captureToken(): Promise<string | null>;
  /** Mirrors the `item` catalog into Spotlight; resolves with the indexed count. */
  indexItemsInSpotlight(): Promise<number>;
  clearSpotlight(): Promise<void>;
};

// Null on Android and on development clients built before the intents existed.
const setup = requireOptionalNativeModule<SetupModule>("AppIntentsSetup");
const store = createMMKV({ id: "app-intents" });
// Which account the keychain token belongs to, so an account switch mints anew.
const CAPTURE_OWNER_KEY = "captureOwner";

const siteUrl =
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
  process.env.EXPO_PUBLIC_CONVEX_URL?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  );

type FeedItem = NonNullable<ReturnType<typeof useHomeFeed>["items"]>[number];
type ListedSpace = FunctionReturnType<typeof api.spaces.listSpaces>[number];

function thumbDirectory() {
  return new Directory(Paths.document, "app-intent-thumbs");
}

function itemTitle(item: FeedItem): string {
  const title = item.title?.trim();
  if (title) return title;
  if (item.type === "note" && item.note)
    return item.note.trim().split("\n")[0].slice(0, 80) || t("item.note");
  if (item.type === "link") return displayHost(item.url) || t("item.link");
  return t("item.savedItem");
}

function itemRecord(item: FeedItem): AppIntents.AppIntentEntity {
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
    ].slice(0, 12),
    metadata,
  };
}

function spaceRecord(space: ListedSpace): AppIntents.AppIntentEntity {
  return {
    id: space._id,
    title: space.name.trim() || t("item.savedItem"),
    subtitle: space.description?.trim() || undefined,
  };
}

function toPlainPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

async function buildThumbnail(url: string, thumb: File): Promise<void> {
  const download = new File(Paths.cache, `app-intent-download-${thumb.name}`);
  try {
    if (download.exists) download.delete();
    await File.downloadFileAsync(url, download);
    const image = await Images.loadFromFileAsync(toPlainPath(download.uri));
    const scale = Math.min(
      1,
      THUMB_MAX_DIM / Math.max(image.width, image.height),
    );
    const resized =
      scale < 1
        ? await image.resizeAsync(
            Math.round(image.width * scale),
            Math.round(image.height * scale),
          )
        : image;
    await resized.saveToFileAsync(toPlainPath(thumb.uri), "jpg", 80);
  } finally {
    if (download.exists) download.delete();
  }
}

/** Writes small JPEGs Spotlight and Siri show beside each save, and prunes the
 * rest. Resolves to whether any new thumbnail was written. */
async function writeThumbnails(
  items: FeedItem[],
  isCurrent: () => boolean,
): Promise<boolean> {
  const dir = thumbDirectory();
  if (!dir.exists) dir.create({ intermediates: true });
  const wanted = new Map<string, string>();
  for (const item of items) {
    const url = item.imageUrl ?? item.heroImageUrl;
    if (url && wanted.size < THUMB_LIMIT) wanted.set(`${item._id}.jpg`, url);
  }

  let created = false;
  for (const [fileName, url] of wanted) {
    if (!isCurrent()) return created;
    const thumb = new File(dir, fileName);
    if (thumb.exists) continue;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        buildThumbnail(url, thumb),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("app_intent_thumbnail_timeout")),
            THUMB_TIMEOUT_MS,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      created = true;
    } catch {
      // A missing thumbnail falls back to a symbol; never block the catalog.
    }
  }
  for (const entry of dir.list()) {
    if (entry instanceof File && !wanted.has(entry.name)) {
      try {
        entry.delete();
      } catch {
        // Best effort; the next publish or sign-out removes it.
      }
    }
  }
  return created;
}

// Serialize publishes so a fast series of Convex pushes can't interleave file
// work, and let a newer publish (or a clear) supersede an older one.
let publishChain: Promise<void> = Promise.resolve();
let publishGeneration = 0;

function publish(work: (isCurrent: () => boolean) => Promise<void>) {
  const generation = ++publishGeneration;
  const isCurrent = () => generation === publishGeneration;
  publishChain = publishChain
    .then(() => (isCurrent() ? work(isCurrent) : undefined))
    .catch((error) =>
      analytics.captureError("app_intents_publish_failed", error),
    );
  return publishChain;
}

/** Empties every catalog Siri and Spotlight read, and the thumbnails. */
function clearCatalogs() {
  return publish(async () => {
    await AppIntents.setEntityCatalogAsync(ITEM_KIND, []);
    await AppIntents.setEntityCatalogAsync(SPACE_KIND, []);
    await setup?.clearSpotlight();
    const dir = thumbDirectory();
    if (dir.exists) dir.delete();
  });
}

/**
 * Forgets everything Siri knows about the signed-out account: capture
 * credentials, queued invocations, and the item and space catalogs (which also
 * empties Spotlight).
 */
async function resetAppIntents(): Promise<void> {
  if (!AppIntents.isAvailable()) return;
  store.remove(CAPTURE_OWNER_KEY);
  await Promise.all([
    setup?.clearCaptureCredentials(),
    AppIntents.clearPendingInvocationsAsync(),
    clearCatalogs(),
  ]);
}

/**
 * Revokes this device's capture token on the server. Called on sign-out while
 * the session can still authenticate; best effort, since the local reset
 * clears the token either way and account deletion drops it server side.
 */
export async function revokeSiriCapture(
  revoke: (args: { token: string }) => Promise<unknown>,
): Promise<void> {
  try {
    const token = await setup?.captureToken();
    if (token) await revoke({ token });
  } catch (error) {
    analytics.captureError("app_intents_revoke_failed", error);
  }
}

/**
 * The session boundary for Siri data, mounted once at the root: when Convex
 * Auth reports signed out, clear the capture token, queued invocations, and
 * every catalog. Runs once per signed-out interval.
 */
export function useAppIntentsSignOutReset(): void {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const reset = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      reset.current = false;
      return;
    }
    if (reset.current) return;
    reset.current = true;
    void resetAppIntents().catch((error) =>
      analytics.captureError("app_intents_reset_failed", error),
    );
  }, [isAuthenticated, isLoading]);
}

/** Publishes the newest saves and all spaces for Siri, Spotlight, and Visual
 * Intelligence. Saves are Pro content, like the widget: without an active
 * entitlement the catalogs are emptied instead. */
function useCatalogSync(entitled: boolean, entitlementLoading: boolean) {
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  const enabled = entitled && AppIntents.isAvailable();
  // The feed loads one page at a time as it scrolls; Spotlight should find
  // older saves without that, so keep paging up to the catalog limit.
  const loadedCount = items?.length ?? 0;
  useEffect(() => {
    if (
      enabled &&
      canLoadMore &&
      !loadingMore &&
      loadedCount < ITEM_CATALOG_LIMIT
    )
      loadMore();
  }, [enabled, canLoadMore, loadingMore, loadedCount, loadMore]);
  // "skip", not `enabled`: see RecentSavesWidgetSync.
  const { data: spaces } = useQuery(
    convexQuery(api.spaces.listSpaces, enabled ? {} : "skip"),
  );
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (entitlementLoading || enabled || !AppIntents.isAvailable()) return;
    lastKey.current = null;
    void clearCatalogs();
  }, [enabled, entitlementLoading]);

  useEffect(() => {
    if (!enabled || items === undefined || spaces === undefined) return;
    const ready = items
      .filter((item) => item.status === "ready")
      .slice(0, ITEM_CATALOG_LIMIT);
    const itemRecords = ready.map(itemRecord);
    const spaceRecords = spaces.map(spaceRecord);
    const key = JSON.stringify([itemRecords, spaceRecords]);
    if (key === lastKey.current) return;
    lastKey.current = key;

    void publish(async (isCurrent) => {
      await AppIntents.setEntityCatalogAsync(SPACE_KIND, spaceRecords);
      await AppIntents.setEntityCatalogAsync(ITEM_KIND, itemRecords);
      // Spotlight first without thumbnails so search works right away, then
      // again once new thumbnails exist.
      await setup?.indexItemsInSpotlight();
      if ((await writeThumbnails(ready, isCurrent)) && isCurrent()) {
        await setup?.indexItemsInSpotlight();
      }
    });
  }, [enabled, items, spaces]);
}

/** Gives the native capture intents a token for this account, minting one
 * when this device has none or it belongs to another account. Any signed-in
 * account gets one: the server checks Pro on every save. */
function useCaptureCredentials(userId: string | undefined) {
  const issueCaptureToken = useAction(api.appIntents.issueCaptureToken);

  useEffect(() => {
    if (!setup || !siteUrl || !userId) return;
    const nativeSetup = setup;
    const url = siteUrl;
    let cancelled = false;
    void (async () => {
      const hasCredentials = await nativeSetup.hasCaptureCredentials();
      if (hasCredentials && store.getString(CAPTURE_OWNER_KEY) === userId)
        return;
      const token = await issueCaptureToken({});
      if (cancelled) return;
      await nativeSetup.setCaptureCredentials(url, token);
      store.set(CAPTURE_OWNER_KEY, userId);
    })().catch((error) =>
      analytics.captureError("app_intents_credentials_failed", error),
    );
    return () => {
      cancelled = true;
    };
  }, [userId, issueCaptureToken]);
}

function param(
  invocation: AppIntents.AppIntentInvocation,
  name: string,
): string | undefined {
  const value = invocation.params[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** A cheap stand-in for the server's URL policy (React Native's URL is too
 * partial to run it here): an oversized or non-web link would be refused on
 * every launch, so it is dropped instead of queued forever. */
function isSavableUrl(url: string): boolean {
  return url.length <= MAX_URL_LENGTH && /^https?:\/\//i.test(url.trim());
}

function spaceParam(
  invocation: AppIntents.AppIntentInvocation,
): Id<"spaces"> | undefined {
  return param(invocation, "spaceId") as Id<"spaces"> | undefined;
}

/** Runs the invocations Siri queued: navigation, and captures that could not
 * reach the server when Siri ran. */
function useInvocationHandler() {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const createNoteItem = useMutation(api.items.createNoteItem);
  const createLinkItem = useMutation(api.items.createLinkItem);
  const saveImages = useSaveImages();
  const inFlight = useRef(new Set<string>());

  async function whenNavigationReady() {
    for (let attempt = 0; attempt < 50 && !navigation.isReady(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async function handle(invocation: AppIntents.AppIntentInvocation) {
    // Siri sends the operation id it already tried, so a save the server
    // committed before its reply was lost is not saved twice. Older queued
    // invocations fall back to the invocation id.
    const operationId =
      param(invocation, "operationId") ?? `siri:${invocation.id}`;
    switch (invocation.name) {
      case "search": {
        await whenNavigationReady();
        // `t` makes a repeated query still count as a new navigation.
        router.navigate({
          pathname: "/(app)/(tabs)/(search)",
          params: {
            q: param(invocation, "query") ?? "",
            t: String(invocation.createdAt),
          },
        });
        return;
      }
      case "openItem": {
        const id = param(invocation, "id");
        if (!id) return;
        await whenNavigationReady();
        router.push({ pathname: "/item/[id]", params: { id } });
        return;
      }
      case "openSpace": {
        const id = param(invocation, "id");
        if (!id) return;
        await whenNavigationReady();
        router.push({ pathname: "/space/[id]", params: { id } });
        return;
      }
      case "saveNote": {
        const text = param(invocation, "text");
        if (text)
          await createNoteItem({
            text,
            spaceId: spaceParam(invocation),
            operationId,
            saveSource: "siri",
          });
        return;
      }
      case "saveLink": {
        const url = param(invocation, "url");
        // A link the server's URL policy refuses would fail on every launch.
        if (url && isSavableUrl(url))
          await createLinkItem({
            url,
            spaceId: spaceParam(invocation),
            operationId,
            saveSource: "siri",
          });
        return;
      }
      case "saveImages": {
        const paths = invocation.params.paths;
        if (!Array.isArray(paths)) return;
        const operationIds = invocation.params.operationIds;
        const staged = paths.flatMap((path, index) => {
          if (typeof path !== "string") return [];
          const file = new File(`file://${encodeURI(path)}`);
          if (!file.exists) return [];
          const sent = Array.isArray(operationIds)
            ? operationIds[index]
            : undefined;
          return [
            {
              file,
              operationId:
                typeof sent === "string" && sent.length > 0
                  ? sent
                  : `${operationId}:${index}`,
            },
          ];
        });
        const files = staged.map(({ file }) => file);
        if (files.length === 0) return;
        const results = await saveImages(
          staged.map(({ file, operationId: imageOperationId }) => ({
            image: { uri: file.uri },
            operationId: imageOperationId,
          })),
          { spaceId: spaceParam(invocation), saveSource: "siri" },
        );
        // A refused image (no Pro, photo limit) would be refused again, so
        // only a transient failure keeps the invocation for the next launch.
        const retry = results.find(
          (result) => result.status === "failed" && result.code === undefined,
        );
        if (retry) throw new Error("app_intents_image_save_failed");
        for (const file of files) file.delete();
        return;
      }
    }
  }

  AppIntents.useAppIntents(async (pending) => {
    for (const invocation of pending) {
      if (inFlight.current.has(invocation.id)) continue;
      inFlight.current.add(invocation.id);
      try {
        await handle(invocation);
        await AppIntents.removePendingInvocationAsync(invocation.id);
      } catch (error) {
        if (saveErrorCode(error) !== null) {
          // Refused (no Pro, photo limit): retrying would only fail again.
          await AppIntents.removePendingInvocationAsync(invocation.id);
        } else {
          // Left pending, so the next launch or invocation retries it.
          analytics.captureError("app_intents_invocation_failed", error, {
            invocation: invocation.name,
          });
        }
      } finally {
        inFlight.current.delete(invocation.id);
      }
    }
  });
}

/**
 * Wires Shelvr into Siri, Shortcuts, and Spotlight. Mount once inside the
 * signed-in tree, under HomeFeedProvider (the catalog reuses the feed's
 * subscription). Renders nothing, and nothing at all off iOS.
 */
export function AppIntentsBridge() {
  if (!AppIntents.isAvailable()) return null;
  return <SignedInAppIntents />;
}

function SignedInAppIntents() {
  const { isAuthenticated } = useConvexAuth();
  const { data: user } = useCurrentUser();
  const { entitled, loading } = useEntitlement();
  useInvocationHandler();
  useCaptureCredentials(isAuthenticated ? user?._id : undefined);
  useCatalogSync(isAuthenticated && entitled, loading);
  return null;
}
